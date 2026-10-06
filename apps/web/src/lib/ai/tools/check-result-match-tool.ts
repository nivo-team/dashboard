import { readFeatureData, resolveFeature } from '#/lib/features/registry'
import type { AiToolDefinition } from '../types'

/**
 * `check_result_match` —— 「某个值在不在当前页面的结果里」的**存在性查询**。
 *
 * ## 它解决什么
 *
 * 数据脱敏后，模型看到的是 `138****1234`，用户问「有没有 13812341234 这个用户」时，
 * 模型既无法确认、也无法把脱敏后的值当原文用。于是**不给它看数据**，让它在浏览器内存里
 * 问一个是非题：匹配在**本地**对**当前页面已加载的数据**（`readFeatureData`）做，
 * **不发任何请求**，并且**只回 `{ exists: boolean }`**。
 *
 * ## 为什么返回里只能有 `exists`
 *
 * 每多一个字段就是多一条泄露通道：命中条数能把"到底是哪一个"缩小到单条，行内容直接就是原文。
 * 所以这里刻意连字段名都不回显 —— 一个 bit 就是它能拿走的一切。
 *
 * ## 四道护栏（缺一不可，对应 §1.4）
 *
 * 1. **每次必问**：与读数据类工具的 `DATA_READ_GRANT`（首次必问 + 本会话允许）**不同**，
 *    它每次调用都弹确认卡、**不写任何会话授权**。理由：它是唯一能逐次问出**未脱敏值**的工具，
 *    连续试探在**交互层**就被用户看见了 —— 这才是枚举攻击的主要防线（`DATA_READ_GRANT` 的
 *    "本会话允许"会让这条防线失效）；
 * 2. **探测值必须来自用户**：`value` 必须是本轮用户消息文本的子串 —— 掐死"模型自己编一个号码
 *    去二分"；用户自己贴一堆号码来试不在此列（那是他本人的数据，风险归他）；
 * 3. **限流**：每会话最多 20 次。每次 bool 查询泄露 ≤ 1 bit，20 bit « 11 位手机号的 37 bit，
 *    于是 `regex` 二分在**额度上**不可行（额度必须小于"定位一个值所需的查询数"，
 *    光靠 `exact` 的价格是挡不住 `regex` 的）；
 * 4. **`field` 必须在字段注解里**：拼错的字段名 / 未注解的字段会取到 `undefined` → 匹配 false
 *    → 回 `{ exists: false }`，而模型会把它当成"用户说的值不存在"。这与"读失败被当成不存在"
 *    是同一种错误结论，所以同样要在**返回之前**拦住（未迁移的页面降级放行，见 execute 第 5 步）。
 *
 * ## 顺序上的取舍
 *
 * 入参校验 / 探测值来源 / 可用数据源与字段注解的元信息 全部在**打扰用户之前**做：注定要失败的
 * 调用不该先弹一张卡（用户点了"允许"再看到报错是最糟的体验）、也不该扣掉一次额度。计数则放在
 * 审批前 `+1` —— 让"被拒绝"同样消耗额度，模型无法靠反复被拒把额度留着继续试探。
 */

/**
 * `FeatureDataSourceSpec.fields` 的**结构视图**。
 *
 * T1 正在给 `lib/features/types.ts` 加这个注解字段；在它落地之前这里就地读结构，
 * **不 import 别人的类型、也不去改那个文件** —— 两边不会互相卡住。
 */
interface DataSourceWithFields {
  fields?: readonly { readonly name: string }[]
}

/** 每会话最多允许的次数（§1.4 第 2 条）。 */
const MAX_CHECKS_PER_SESSION = 20

/** 允许的匹配模式（与 `inputSchema.enum` 同一份真值）。 */
const MATCH_MODES = ['exact', 'prefix', 'contains', 'regex'] as const
type MatchMode = (typeof MATCH_MODES)[number]

function isMatchMode(value: unknown): value is MatchMode {
  return (
    typeof value === 'string' && (MATCH_MODES as readonly string[]).includes(value)
  )
}

/**
 * 一次匹配。
 *
 * 行里的值统一转成字符串再比 —— `value` 按契约就是字符串形式（数字 / 日期也传字符串），
 * 这样 `13812341234`（number）与 `'13812341234'` 走的是同一条路。
 */
function cellMatches(
  cell: unknown,
  value: string,
  mode: MatchMode,
  regex: RegExp | null,
): boolean {
  if (cell === null || cell === undefined) return false
  const text = typeof cell === 'string' ? cell : String(cell)
  switch (mode) {
    case 'exact':
      return text === value
    case 'prefix':
      return text.startsWith(value)
    case 'contains':
      return text.includes(value)
    case 'regex':
      return regex !== null && regex.test(text)
  }
}

/** `read()` 的返回值归一成「记录数组」：数组逐个成行，单条记录包成一项，其余算没有数据。 */
function toRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Record<string, unknown> =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    )
  }
  if (typeof value === 'object' && value !== null) {
    return [value as Record<string, unknown>]
  }
  return []
}

/**
 * `readFeatureData` 对读取失败的数据源会就地记成 `{ error }`（它刻意不让一个坏数据源
 * 拖垮整次读取）。这种快照**不能当成"没有这个值"** —— 它会让模型把"页面没读到"当成
 * "用户说的值不存在"，正是本工具要避免的错误结论。
 */
function isReadErrorSnapshot(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.error === 'string' && Object.keys(record).length === 1
  )
}

export const checkResultMatchTool: AiToolDefinition = {
  name: 'check_result_match',
  catalogDescription: '检查页面数据是否存在指定值',
  description:
    '检查页面数据中某字段是否存在符合条件的值，只答存在 / 不存在。field 须取自 get_page_data 注解，value 须来自用户；每次调用都要用户同意，被拒不重试。',
  dependencies: ['get_page_data'],
  inputSchema: {
    type: 'object',
    properties: {
      field: { type: 'string', description: '要检查的字段名，必须是 get_page_data 返回的字段注解里的 name' },
      value: { type: 'string', description: '要匹配的值（字符串形式，数字/日期也传字符串）' },
      mode: {
        type: 'string',
        enum: ['exact', 'prefix', 'contains', 'regex'],
        description: '匹配模式：exact 完全相等；prefix 前缀；contains 包含；regex 正则（谨慎使用）',
      },
      source: { type: 'string', description: '可选：只查某个数据源（按数据源 id），不传则查当前页面全部数据源' },
    },
    required: ['field', 'value', 'mode'],
    additionalProperties: false,
  },
  capability: 'data:query',
  execute: async (input, ctx) => {
    // ── 1. 入参校验（不打扰用户，也不动数据）──────────────────────────────
    const field = typeof input.field === 'string' ? input.field.trim() : ''
    if (!field) {
      throw new Error('缺少要检查的字段名 field。字段名以 get_page_data 返回的注解为准。')
    }

    const value = typeof input.value === 'string' ? input.value : ''
    if (!value) {
      throw new Error('缺少要匹配的值 value（字符串形式，数字 / 日期也传字符串）。')
    }

    const mode = input.mode
    if (!isMatchMode(mode)) {
      throw new Error(
        `不支持的匹配模式：${String(mode)}。可用的是：${MATCH_MODES.join(' / ')}`,
      )
    }

    const source = typeof input.source === 'string' ? input.source.trim() : ''

    // ── 2. 探测值必须来自用户（§4.8 的 a，最强的那条护栏）──────────────
    const userMessage = ctx.getUserMessageText()
    if (!userMessage.includes(value)) {
      throw new Error(
        '只能检查用户明确提到过的值。不要自己造值来试探；用户没说过这个值，就先请用户提供。',
      )
    }

    // ── 3. 正则先编译：构造失败立即抛错（§1.4 第 4 条）─────────────────
    let regex: RegExp | null = null
    if (mode === 'regex') {
      try {
        regex = new RegExp(value)
      } catch (error) {
        throw new Error(
          `正则表达式无效：${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // ── 4. 页面 / 数据源的**元信息**检查（不读数据内容，先于审批）────────
    const routeId = ctx.getPageContext().routePath
    const dataSources = resolveFeature(routeId)?.dataSources ?? []
    if (dataSources.length === 0) {
      throw new Error(
        '当前页面还没有向 AI 声明数据源，无法在本地检查。请让用户自己查看页面，或改用 search_api + call_read_api 取数。',
      )
    }
    if (source && !dataSources.some((item) => item.id === source)) {
      throw new Error(
        `没有这个数据源：${source}。可用的是：${dataSources
          .map((item) => item.id)
          .join(' / ') || '（无）'}`,
      )
    }

    // ── 5. 字段注解校验：拼错的字段不能伪装成"值不存在"（先于审批与限流）──
    /*
      只看**本次真正要查的那些数据源**（`source` 指定则只看它）。三种情形：
      - 目标数据源**都**有非空 `fields` → 严格校验，字段没注解就抛错并列出可用字段名；
      - 目标数据源**都**没有注解（页面还没迁到注解）→ **降级放行**，不假装校验过：
        宁可查（可能查不到），也不要因为"没注解"就谎报"值不存在"；
      - 混合（有的注解了、有的没有）→ 无法证明字段非法，同样放行。
    */
    const targets = source
      ? dataSources.filter((item) => item.id === source)
      : dataSources
    const allAnnotated = targets.every((item) => {
      const fields = (item as DataSourceWithFields).fields
      return Array.isArray(fields) && fields.length > 0
    })
    if (allAnnotated) {
      const available = [
        ...new Set(
          targets.flatMap(
            (item) => (item as DataSourceWithFields).fields ?? [],
          ).map((item) => item.name),
        ),
      ]
      if (!available.includes(field)) {
        throw new Error(
          `字段「${field}」不在当前页面数据源的字段注解里，无法检查。可用的是：${available.join(' / ')}`,
        )
      }
    }

    // ── 6. 限流：先扣额度，再问用户 ────────────────────────────────────
    // 被拒绝的调用同样消耗额度，模型不能靠"反复被拒"把额度留着继续试探。
    const used = ctx.bumpToolCounter('check_result_match')
    if (used > MAX_CHECKS_PER_SESSION) {
      throw new Error(
        `本次会话的存在性检查次数已用完（${MAX_CHECKS_PER_SESSION} 次）。不要继续试探；如需精确结果，请让用户自己查看页面。`,
      )
    }

    // ── 7. 每次必问：不读会话授权（它没有"本会话允许"这一档）────────────
    const approved = await ctx.requestApproval({
      toolName: 'check_result_match',
      input,
      reason:
        'AI 想检查当前页面已加载的数据里是否存在用户提到的某个值。它只会回答"存在 / 不存在"，数据本身不会给 AI。',
    })
    if (!approved) {
      throw new Error('用户拒绝了这次检查。不要重试，改为向用户说明并询问下一步。')
    }

    // ── 8. 本地匹配：读页面已加载的数据，绝不发请求 ────────────────────
    const snapshots = readFeatureData(routeId)
    const picked = source
      ? snapshots.filter((item) => item.id === source)
      : snapshots
    const readable = picked.filter(
      (item) => !isReadErrorSnapshot(item.value),
    )
    if (readable.length === 0) {
      throw new Error(
        '当前页面的数据源读取失败，无法在本地检查。请让用户自己查看页面。',
      )
    }

    let matched = false
    for (const snapshot of readable) {
      for (const record of toRecords(snapshot.value)) {
        if (cellMatches(record[field], value, mode, regex)) {
          matched = true
          break
        }
      }
      if (matched) break
    }

    // ── 9. 只回一个 bit（多一个字段就多一条泄露通道）────────────────────
    return { exists: matched }
  },
}
