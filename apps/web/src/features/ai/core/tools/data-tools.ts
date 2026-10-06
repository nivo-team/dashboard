import { client, getApiQueryOptions, getDataDictOptionsQueryOptions } from '#/api'
import { normalizeDictOptions } from '#/lib/dict-options'
import { needsApproval } from '../approval-policy'
import { reloadAiPageData } from '../page-reload-bridge'
import { DATA_READ_GRANT } from '../session-permissions'
import type { ApiItem } from '#/api'
import type { AiToolContext, AiToolDefinition } from '../types'

/**
 * 「取数」类工具：检索接口清单、调用只读接口、读字典枚举。
 *
 * 两条安全约定（见 .agents/docs/ai-integration.md §3.3）：
 * 1. **白名单**：只能调 `GET /api` 清单里真实存在、且 method 为 GET 的接口 ——
 *    清单既是给模型检索的索引，也是它无法越过的边界；
 * 2. **只读**：这里没有任何写方法。写操作将来走 `commit` 工具 + 人工审批，不在这条路上开口子。
 */

/** 接口清单是静态路由表：30 分钟内不重复请求（与 `feature-apis.ts` 保持同一个量级）。 */
const API_LIST_STALE_TIME = 30 * 60 * 1000
const DICT_STALE_TIME = 30 * 60 * 1000
/**
 * 结果超过这个长度就截断：列表接口动辄几百条，整包塞进上下文会挤掉真正有用的信息。
 *
 * 从 12000 降到 6000：单条 12000 字符约合 5K token，而**它会跟着后面每一轮重发**
 * （见 `runtime.ts` 的历史衰减，那里只兜住"更早的轮次"）。截断时会明确告诉模型
 * 被截断了，它改用更精确的参数或分页即可，不会拿半截数据当全量。
 */
const MAX_RESULT_CHARS = 6_000

async function loadApiItems(ctx: AiToolContext): Promise<ApiItem[]> {
  const data = await ctx.queryClient.fetchQuery({
    ...getApiQueryOptions(),
    staleTime: API_LIST_STALE_TIME,
  })
  return data?.result ?? []
}

/**
 * 超长结果的处理：**明确告诉模型被截断了**，并给出原始长度 ——
 * 否则它会拿一段截断的数据当全量去统计，得出错误结论。
 */
export function truncatePayload(value: unknown): unknown {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    return value
  }
  if (typeof text !== 'string' || text.length <= MAX_RESULT_CHARS) return value
  return {
    truncated: true,
    note: `结果过长（约 ${text.length} 字符），已截断。请改用更精确的查询参数或分页缩小范围。`,
    preview: text.slice(0, MAX_RESULT_CHARS),
  }
}

/**
 * 白名单解析：把「模型给的路径（模板或真实路径）+ `pathParams`」解析成**真实路径**，
 * 并在清单里找到对应条目（method 一致 + 模板匹配）。
 *
 * **只读与写工具共用这一处**（`call_read_api` / `call_write_api`）：两条路的边界必须完全一致，
 * 各写一份迟早分叉 —— 而分叉的后果是"同一个接口能读不能写"或者反过来绕过白名单。
 *
 * 失败时抛错并给出可执行的下一步（让模型去 `search_api` 查），而不是静默返回空。
 */
function resolveWhitelistedPath(
  items: readonly ApiItem[],
  method: string,
  rawPath: string,
  pathParams?: Record<string, unknown>,
): string {
  const path = resolvePathTemplate(rawPath, pathParams)
  const matched = items.find(
    (item) =>
      (item.method ?? '').toUpperCase() === method &&
      isPathAllowedForTemplate(item.path, path),
  )
  if (!matched) {
    throw new Error(
      `接口不在清单里，或 method 不匹配：${method} ${path}。请先用 search_api 确认接口与它声明的路径参数。`,
    )
  }
  return path
}

export const searchApiTool: AiToolDefinition = {
  name: 'search_api',
  catalogDescription: '搜索后台的业务接口',
  description:
    '在接口清单里按关键词检索接口（方法与路径）。调用任何业务接口前先用它确认接口路径与参数名，不得凭印象猜测。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '关键词，例如 user、data_dict、menu',
      },
      limit: {
        type: 'number',
        description: '返回条数上限，默认 20，最大 50',
      },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
  capability: 'data:query',
  execute: async (input, ctx) => {
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase() : ''
    if (!keyword) throw new Error('缺少检索关键词')

    const rawLimit = typeof input.limit === 'number' ? input.limit : 20
    const limit = Math.min(Math.max(Math.trunc(rawLimit) || 20, 1), 50)

    const items = await loadApiItems(ctx)
    const matched = items.filter((item) => {
      const haystack = `${item.method ?? ''} ${item.path ?? ''} ${item.label ?? ''}`.toLowerCase()
      return haystack.includes(keyword)
    })

    return {
      total: matched.length,
      items: matched.slice(0, limit).map((item) => ({
        method: item.method,
        path: item.path,
        label: item.label,
      })),
      note:
        matched.length > limit
          ? `仅返回前 ${limit} 条，共 ${matched.length} 条命中；请用更精确的关键词收窄。`
          : undefined,
    }
  },
}

export const callReadApiTool: AiToolDefinition = {
  name: 'call_read_api',
  catalogDescription: '调用只读业务接口取数',
  description:
    '调用只读（GET）业务接口取回真实数据。path 必须是 search_api 清单里存在的接口，参数名以接口声明为准，不得猜测。结果被截断（truncated）时不要据此下结论，改用更精确的参数或分页。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '接口路径，例如 /user 或带占位符的 /user/{id}',
      },
      pathParams: {
        type: 'object',
        description:
          '路径参数对象（可选）。当 path 里带 {id} 这类占位符时用它填值，例如 {"id": 10001}',
        additionalProperties: true,
      },
      query: {
        type: 'object',
        description: '查询参数对象，例如 { page: 1, page_size: 20 }',
        additionalProperties: true,
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  capability: 'data:query',
  // 通用读通道：只要能读**任一**模块就放行；具体接口的权限在执行时按模块再校验
  requiredPermissionsAny: ['*:read'],
  execute: async (input, ctx) => {
    const rawPath = typeof input.path === 'string' ? input.path.trim() : ''
    if (!rawPath) throw new Error('缺少接口路径')

    const pathParams =
      input.pathParams && typeof input.pathParams === 'object'
        ? (input.pathParams as Record<string, unknown>)
        : undefined

    const items = await loadApiItems(ctx)
    const path = resolveWhitelistedPath(items, 'GET', rawPath, pathParams)

    const query =
      input.query && typeof input.query === 'object'
        ? (input.query as Record<string, unknown>)
        : undefined

    /*
      **读数据授权**：与 `get_page_data` 共用 `DATA_READ_GRANT` 这一条会话授权 ——
      用户同意的是"这个会话里 AI 可以读我的业务数据"这项**能力**，不是某一个工具名。
      所以先授权过 `get_page_data` 的话，这里不会再弹一次卡。
      被拒**直接抛错**（不发请求、不静默返回空），模型才知道是"用户不同意"。
    */
    if (needsApproval('read', { mode: ctx.mode })) {
      const approved = await ctx.requestApproval({
        toolName: DATA_READ_GRANT,
        input: { tool: 'call_read_api', source: path },
        reason: 'AI 想调用这个接口读取业务数据',
      })
      if (!approved) {
        throw new Error('用户拒绝让 AI 读取数据。不要重试，改为请用户自己查看。')
      }
    }

    const result = await client.get({ url: path, query })
    if (result.error) {
      const message =
        typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
      throw new Error(`接口调用失败：${message}`)
    }

    return truncatePayload(result.data)
  },
}

export const listDictOptionsTool: AiToolDefinition = {
  name: 'list_dict_options',
  catalogDescription: '读取数据字典的可选项',
  description:
    '读取数据字典的枚举选项（值 → 文案），用于翻译接口返回的枚举字段。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '字典键，例如 user.status；省略则只返回有哪些键',
      },
    },
    additionalProperties: false,
  },
  capability: 'data:query',
  execute: async (input, ctx) => {
    const data = await ctx.queryClient.fetchQuery({
      ...getDataDictOptionsQueryOptions(),
      staleTime: DICT_STALE_TIME,
    })
    const map = normalizeDictOptions(data?.result)

    const path = typeof input.path === 'string' ? input.path.trim() : ''
    if (!path) return { keys: Object.keys(map) }

    const options = map[path]
    if (!options) {
      throw new Error(`没有这个字典键：${path}。可用键见不传 path 时的返回结果。`)
    }
    return { path, options }
  },
}

/**
 * 把模板路径里的 `{name}` 用 `pathParams` 替换成真实路径。
 *
 * 两类输入都要收（模型给哪种都行）：
 * - **模板**（`/user/{id}`）→ 必须能从 `pathParams` 里取到每个占位符；**缺一个就报错**，
 *   绝不把 `{id}` 原样发出去（那会打到 `/user/%7Bid%7D` 这种 404 上，而模型会以为已删掉）；
 * - **已经是真实路径**（`/user/10001`）→ 原样返回。
 */
function resolvePathTemplate(
  rawPath: string,
  pathParams?: Record<string, unknown>,
): string {
  const placeholders = [...rawPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])
  if (placeholders.length === 0) return rawPath

  const missing = placeholders.filter(
    (name) => pathParams?.[name] === undefined || pathParams[name] === null,
  )
  if (missing.length > 0) {
    throw new Error(
      `路径 ${rawPath} 缺少路径参数：${missing.join(' / ')}。请用 pathParams 传入（例如 {"${missing[0]}": 10001}）。`,
    )
  }

  return placeholders.reduce(
    (acc, name) =>
      acc.replace(`{${name}}`, encodeURIComponent(String(pathParams?.[name]))),
    rawPath,
  )
}

/**
 * 清单里的**模板路径**是否覆盖这个**真实路径**。
 *
 * 白名单校验的仍然是"替换完成后的真实路径"：`/user/{id}` 只放行 `/user/xxx`（一段），
 * 不放行 `/user`、也不放行 `/user/1/2`。所以"支持模板"只是把比较方式从字符串相等
 * 换成模板匹配，**边界没有被放宽**（这就是删除类接口能用、而乱拼路径仍然被拒的原因）。
 */
function isPathAllowedForTemplate(template: string, path: string): boolean {
  if (template === path) return true
  if (!template.includes('{')) return false

  const pattern = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/]+')
  return new RegExp(`^${pattern}$`).test(path)
}

/**
 * 写操作工具：**唯一一个「两个模式都要人工审批」的工具**。
 *
 * 三道闸门（缺一不可）：
 * 1. **权限**：`readonly` 档不给它；`custom` 档要用户显式勾选；`full` 档才默认带上
 *    （见 `getAllowedTools`）—— 早先这里写的是"只有 auto 模式的工具集里才有它"，
 *    那是把**权限**错当成了**模式**；
 * 2. **白名单**：路径与 method 都必须能在 `GET /api` 清单里对上 —— 与只读工具同一份边界；
 * 3. **人工审批**：真正发请求之前 `await ctx.requestApproval(...)`，用户点了「允许」才发。
 *    **`ask` 与 `auto` 都要问**，刻意不读 `ctx.mode`：表单提交在 auto 下可以免确认，
 *    因为表单自己用 `canSubmit()` 把关、用户也能看见填了什么；而通用写接口没有可预览的表单，
 *    自动执行等于让模型直接改库。被拒绝时**直接抛错**（而不是静默跳过）：
 *    模型必须知道这次没执行，才不会向用户谎报成功。
 *
 * ## 路径参数（`{id}`）与删除类操作
 *
 * 清单里的路径**带占位符**（`DELETE /user/{id}`、`DELETE /system/menu/{id}`），
 * 早期实现拿模型给的字符串与清单做**完全相等**比较，于是这些接口永远匹配不上 ——
 * 所有「删除某一条」在 AI 侧都是死的。现在两种给法都收：
 * - 给**模板** `path: "/user/{id}"` + `pathParams: { id: 10001 }`；
 * - 或者直接给**替换好的真实路径** `/user/10001`（按模板匹配）。
 * 白名单校验的对象始终是**替换完成后的真实路径**，所以"模板匹配"不会放宽边界。
 */
export const callWriteApiTool: AiToolDefinition = {
  name: 'call_write_api',
  catalogDescription: '调用写入业务接口改数据（批量创建、批量录入必选）',
  description:
    '调用会修改数据的接口（POST / PUT / PATCH / DELETE），批量录入多条数据直接调它。path 与参数名必须来自 search_api 或页面接口清单，不得猜测；每次调用系统都会请用户确认，删除不可撤销，被拒绝后不要重试同一请求，改为向用户说明。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '接口路径，必须是 search_api 返回过的接口（可以是带 {id} 的模板）' },
      method: {
        type: 'string',
        enum: ['POST', 'PUT', 'PATCH', 'DELETE'],
        description: 'HTTP 方法',
      },
      pathParams: {
        type: 'object',
        description:
          '路径参数对象（可选）。当 path 里带 {id} 这类占位符时用它填值，例如 {"id": 10001}',
        additionalProperties: true,
      },
      query: {
        type: 'object',
        description: '查询参数对象（可选）',
        additionalProperties: true,
      },
      body: {
        type: 'object',
        description: '请求体（JSON 对象，可选）',
        additionalProperties: true,
      },
    },
    required: ['path', 'method'],
    additionalProperties: false,
  },
  capability: 'data:write',
  // 通用写通道：需要**任一**写权限；精确到接口的校验在执行时做，后端再按身份兜底
  requiredPermissionsAny: ['*:create', '*:edit', '*:update', '*:delete', '*:write'],
  execute: async (input, ctx) => {
    const rawPath = typeof input.path === 'string' ? input.path.trim() : ''
    if (!rawPath) throw new Error('缺少接口路径')

    /*
      用**字面量比较**而不是 `Set.has`：这样 TS 会把 `method` 收窄成四个字面量的联合，
      下面才能走 `client.post / put / patch / delete` —— 而 `client.request` 的 `method`
      参数是 `HttpMethod` 联合类型，直接塞一个 `string` 是过不了类型检查的。
    */
    const rawMethod =
      typeof input.method === 'string' ? input.method.trim().toUpperCase() : ''
    if (
      rawMethod !== 'POST' &&
      rawMethod !== 'PUT' &&
      rawMethod !== 'PATCH' &&
      rawMethod !== 'DELETE'
    ) {
      throw new Error(`只支持 POST / PUT / PATCH / DELETE，收到的是：${rawMethod || '空'}`)
    }
    const method = rawMethod

    const pathParams =
      input.pathParams && typeof input.pathParams === 'object'
        ? (input.pathParams as Record<string, unknown>)
        : undefined

    // 白名单：清单里存在、且 method 完全一致 —— 清单也是「AI 能碰哪些接口」的边界。
    // 比对用**模板匹配**（`/user/{id}` ↔ `/user/10001`），比对的仍然是替换后的真实路径。
    const items = await loadApiItems(ctx)
    const path = resolveWhitelistedPath(items, method, rawPath, pathParams)

    const query =
      input.query && typeof input.query === 'object'
        ? (input.query as Record<string, unknown>)
        : undefined
    const body =
      input.body && typeof input.body === 'object'
        ? (input.body as Record<string, unknown>)
        : undefined

    // 审批：把 method / path / 参数原样交给用户看，DELETE 额外标一句不可撤销。
    // `write` 那一行**不读 `ctx.mode`** —— 两个模式都要问（没有可预览的表单）
    const approved = await ctx.requestApproval({
      toolName: 'call_write_api',
      input: { method, path, ...(pathParams ? { pathParams } : {}), query, body },
      reason:
        method === 'DELETE'
          ? '这是一次删除操作，执行后无法撤销'
          : '这会修改服务端的数据',
    })
    if (!approved) {
      throw new Error(
        '用户拒绝了这次操作，请求没有发出。不要重试同一个请求，改为向用户说明并询问下一步。',
      )
    }

    const requestOptions = { url: path, query, body }
    const result =
      method === 'POST'
        ? await client.post(requestOptions)
        : method === 'PUT'
          ? await client.put(requestOptions)
          : method === 'PATCH'
            ? await client.patch(requestOptions)
            : await client.delete(requestOptions)

    if (result.error) {
      const message =
        typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
      throw new Error(`接口调用失败：${message}`)
    }

    /*
      写成功后**刷新页面数据**，两条路：
      1. **页面自己登记过的重载**（`page-reload-bridge`）：走页面自己的取数语义
         （保留筛选 / 分页 / 排序）。列表页常把数据放在 React state 里（表格示例页就是），
         react-query 那条路对它完全无效 —— 不刷新的话用户会看到"删了但还在"，与 AI 的回答矛盾；
      2. **react-query 兜底**：页面没登记时整体失效一次（工具拿不到页面的 query key）。
      ⚠️ 这是通用通道的兜底；页面自己声明的动作（capabilities.actions）才拥有精确的
      提示与刷新语义，将来接入「动作桥」时优先走那边。
    */
    if (!reloadAiPageData()) {
      void ctx.queryClient.invalidateQueries()
    }

    return truncatePayload(result.data)
  },
}
