import { readFeatureData, resolveFeature } from '#/features/ai/page/registry'
import type { FeatureDataFieldSpec } from '#/features/ai/page/types'
import { toDisplayText } from '#/lib/to-text'
import { needsApproval } from '../approval-policy'
import { DATA_READ_GRANT } from '../session-permissions'
import type { AiToolDefinition } from '../types'

/**
 * `analyze_data` —— **表达式分析**工具（AI 不接触数据）。
 *
 * ## 它解决什么
 *
 * 模型想看统计结果（「这一屏有多少条」「按状态分组各多少」「金额最大的 3 条」），
 * 但**不该看数据**。所以它写一个 **JSON 操作链**（不是代码字符串），客户端拿页面
 * 本地已加载的数据求值，只把**结果**回给它 —— 类比 Excel：AI 写公式，Excel 算。
 *
 * ## 两条不可退让的约束
 *
 * 1. **永不 `eval` / `new Function`**：表达式是纯数据结构，求值器是纯数据驱动的
 *    `switch`。模型给不出「代码」，也就不存在注入面（见规范 §3.6）。
 * 2. **字段必须已注解**：`field` / `by` 不在该数据源的 `fields` 里就抛错并列出可用字段。
 *    未注解的字段 AI 一律不可用 —— 宁缺勿猜：猜错字段名会算出一个**错数**，比不给还糟。
 *
 * ## 边界
 *
 * - `pipeline` ≤ 8 步、`topN.limit` ≤ 100、结果数组 ≤ 100 项（超界抛错，不是静默截断）；
 * - 只读：`readFeatureData` 读的是页面已加载的数据，**不发任何请求**；
 * - **读数据前必经 `DATA_READ_GRANT` 会话授权**（首次必问 + 本会话允许，§1.3）：
 *   它虽只回聚合结果，但「共 1234 条」本身就是业务信息；
 * - 敏感字段：**可以**参与 `filter`（比较不泄露值），但 `groupBy` / `distinct` 到敏感字段
 *   直接抛错；结果里的原始行也会剔除敏感字段与未注解字段的值（见 §3.7）。
 */

/** 一行数据：键与字段注解的 `name` 完全一致。 */
type Row = Record<string, unknown>

/** 求值器内部的「当前阶段」：一批行 + 此刻可见的字段集。 */
interface Stage {
  rows: Row[]
  fields: Map<string, FeatureDataFieldSpec>
}

const OPS = [
  'filter',
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'groupBy',
  'sort',
  'topN',
  'distinct',
] as const
type Op = (typeof OPS)[number]

const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const
type AggFn = (typeof AGG_FNS)[number]

const COMPARATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] as const
type Comparator = (typeof COMPARATORS)[number]

/** 一步操作最多 8 步：够表达"筛 → 分组 → 排序 → 取前 N"，也挡住了把工具当脚本跑。 */
const MAX_STEPS = 8
/** 结果数组上限：只把**小结果**带回对话，原始行永远不出去。 */
const MAX_RESULT_ROWS = 100

export const analyzeDataTool: AiToolDefinition = {
  name: 'analyze_data',
  catalogDescription: '统计当前页面已加载的数据',
  description:
    '对当前页面已加载的数据做统计（计数 / 求和 / 分组 / 排序 / 去重）：你写一条 JSON 操作链，客户端本地求值后只把结果给你。source 与字段名必须来自 get_page_data 的字段注解，不得猜测；pipeline 最多 8 步。',
  dependencies: ['get_page_data'],
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '数据源 id，来自 get_page_data' },
      pipeline: {
        type: 'array',
        description: '按顺序执行的操作链，最多 8 步',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: [
                'filter',
                'count',
                'sum',
                'avg',
                'min',
                'max',
                'groupBy',
                'sort',
                'topN',
                'distinct',
              ],
            },
            field: { type: 'string', description: '目标字段（count 不需要）' },
            eq: {},
            neq: {},
            gt: {},
            gte: {},
            lt: {},
            lte: {},
            in: {},
            contains: {},
            fn: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
            by: { type: 'string', description: 'groupBy 的分组字段' },
            order: { type: 'string', enum: ['asc', 'desc'] },
            limit: { type: 'number' },
          },
          required: ['op'],
        },
      },
    },
    required: ['source', 'pipeline'],
  },
  capability: 'data:query',
  execute: async (input, ctx) => {
    const routeId = ctx.getPageContext().routePath
    const sourceId = typeof input.source === 'string' ? input.source.trim() : ''
    if (!sourceId) {
      throw new Error(
        '缺少 source：请先用 `get_page_data` 看当前页面有哪些数据源，再把其中之一的 id 传进来。',
      )
    }

    const spec = resolveFeature(routeId)
    if (!spec) {
      throw new Error(
        '当前页面没有向 AI 声明数据源，`analyze_data` 读不到数据。请改用 `search_api` + `call_read_api` 取数，或让用户自己在页面查看。',
      )
    }

    const dataSources = spec.dataSources ?? []
    const source = dataSources.find((item) => item.id === sourceId)
    if (!source) {
      const available = dataSources.map((item) => item.id)
      throw new Error(
        available.length > 0
          ? `没有这个数据源：${sourceId}。可用的是：${available.join(' / ')}`
          : '当前页面没有声明任何数据源。请改用 `search_api` + `call_read_api` 取数。',
      )
    }

    /*
      字段注解是**唯一**的字段真值：未注解的字段 AI 不可用（`fields` 见规范 §1.1）。
    */
    const declaredFields: readonly FeatureDataFieldSpec[] = source.fields ?? []
    if (declaredFields.length === 0) {
      throw new Error(
        `数据源 ${sourceId} 还没有字段注解，AI 不能对它做表达式分析（未注解的字段一律不可用，避免猜错字段名算出错数）。请改用 \`get_page_data\` 让用户自己查看，或在页面 \`feature.ts\` 里补 \`fields\` 注解。`,
      )
    }

    const pipeline = readPipeline(input.pipeline)

    const fields = new Map<string, FeatureDataFieldSpec>(
      declaredFields.map((field): [string, FeatureDataFieldSpec] => [field.name, field]),
    )

    /*
      **静态校验前置**：`validatePipeline` 只校验字段注解 / 类型 / limit / 操作顺序，
      不读任何数据。注定失败的调用**不该打扰用户** —— 与 `check_result_match` 同一顺序约定。
    */
    validatePipeline(fields, pipeline)

    /*
      「允许 AI 读取业务数据」的**会话授权**（`DATA_READ_GRANT`，§1.3）。
      它把聚合结果带进对话，而这本身就是业务信息（「共 1234 条」「按状态分布…」），
      所以与 `get_page_data` 是同一件事，用户该知道 AI 正在统计他的表格。
      档位是**首次必问 + 本会话允许**（不是 `check_result_match` 的每次必问）——
      「本会话允许」由 `chat.ts` 的 `requestApproval` 查会话授权后短路，这里不用自己判断。

      顺序刻意放在**所有静态校验之后、读数据之前**：注定失败的调用不弹卡，
      而只要真要读，就一定先问。
    */
    if (needsApproval('read', { mode: ctx.mode })) {
      const approved = await ctx.requestApproval({
        toolName: DATA_READ_GRANT,
        input: { tool: 'analyze_data', source: sourceId },
        reason: 'AI 想统计当前页面的数据（只取聚合结果，不读取明细；敏感字段不参与输出）',
      })
      if (!approved) {
        throw new Error('用户拒绝让 AI 读取数据。不要重试，改为请用户自己查看页面。')
      }
    }

    const rows = readRows(routeId, sourceId)
    const value = evaluate({ rows, fields }, pipeline)
    return { ok: true, value }
  },
}

/* ------------------------------------------------------------------ */
/* 输入校验                                                            */
/* ------------------------------------------------------------------ */

function readPipeline(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      'pipeline 必须是操作数组，例如 [{ op: "filter", field: "status", eq: "active" }, { op: "count" }]。',
    )
  }
  if (raw.length === 0) {
    throw new Error('pipeline 不能为空：至少要一步，例如 [{ op: "count" }]。')
  }
  if (raw.length > MAX_STEPS) {
    throw new Error(
      `pipeline 最多 ${MAX_STEPS} 步（收到 ${raw.length} 步）。请把操作合并或拆成多次调用。`,
    )
  }
  return raw.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`pipeline 第 ${index + 1} 步不是一个对象，每一步都要是 { op, ... } 形状。`)
    }
    return step as Record<string, unknown>
  })
}

/** 本地读数据：`readFeatureData` 只读页面已加载的值，**不发请求**。 */
function readRows(routeId: string | null, sourceId: string): Row[] {
  const snapshot = readFeatureData(routeId).find((item) => item.id === sourceId)
  const value = snapshot?.value

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'error' in value) {
    const message = (value as { error?: unknown }).error
    throw new Error(
      `读取数据源 ${sourceId} 失败：${typeof message === 'string' ? message : String(message)}。数据源自己的 read() 抛错了，请改用 \`get_page_data\` 或让用户查看页面。`,
    )
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `数据源 ${sourceId} 不是行数组（读到 ${describeValue(value)}），无法做表达式分析。请先用 \`get_page_data\` 看它到底是什么形状，或换一个列表类数据源。`,
    )
  }
  return value.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row) ? (row as Row) : { value: row },
  )
}

/* ------------------------------------------------------------------ */
/* 求值器（纯数据驱动，无 eval / new Function）                        */
/* ------------------------------------------------------------------ */

/** 产出**标量**、因而必须是最后一步的 op。 */
const SCALAR_OPS: readonly Op[] = ['count', 'sum', 'avg', 'min', 'max', 'distinct']

/**
 * 一步操作**解析后的执行计划**。
 *
 * 字段注解 / 类型 / limit / 操作顺序这些**不依赖数据**的校验全部收在 `planStep` 里：
 * 同一份规则既能在审批前预跑（`validatePipeline` —— 注定失败就不打扰用户），
 * 也能在执行时逐步复用，不复制第二份校验、避免两边漂移。
 */
interface StepPlan {
  /** filter / sort / topN / distinct 的目标字段 */
  fieldName?: string
  spec?: FeatureDataFieldSpec
  /** filter 的比较条件（多个条件按 AND 组合）：算子 + 期望值 */
  conditions?: Array<{ comparator: Comparator; expected: unknown }>
  /** 聚合函数；非聚合步骤保持缺省 count */
  aggFn: AggFn
  /** 聚合（sum/avg/min/max，或 groupBy 的 fn）的目标字段 */
  aggFieldName?: string
  aggSpec?: FeatureDataFieldSpec
  /** groupBy 的分组字段 */
  byName?: string
  bySpec?: FeatureDataFieldSpec
  order: 'asc' | 'desc'
  limit?: number
}

/** 解析并**静态校验**一步操作（不读数据）；校验失败一律抛错并给出可执行的下一步。 */
function planStep(
  fields: Map<string, FeatureDataFieldSpec>,
  step: Record<string, unknown>,
  op: Op,
): StepPlan {
  const plan: StepPlan = { aggFn: 'count', order: 'asc' }

  switch (op) {
    case 'filter': {
      const fieldName = readString(step, 'field')
      if (!fieldName) {
        throw new Error(
          'filter 需要 field（要对哪个字段做条件）。字段名见 get_page_data 的 fields。',
        )
      }
      plan.fieldName = fieldName
      plan.spec = requireField(fields, fieldName, 'filter')
      plan.conditions = COMPARATORS.filter((comparator) => step[comparator] !== undefined).map(
        (comparator) => ({ comparator, expected: step[comparator] }),
      )
      if (plan.conditions.length === 0) {
        throw new Error(
          `filter 的 field=${fieldName} 没有给任何比较条件。可用的是：eq / neq / gt / gte / lt / lte / in / contains。`,
        )
      }
      // `in` 的值必须是数组 —— 静态可判定，所以在这里（而不是逐行比较时）就拒绝。
      if (
        plan.conditions.some(
          (condition) => condition.comparator === 'in' && !Array.isArray(condition.expected),
        )
      ) {
        throw new Error(
          `filter 的 in 需要一个数组，例如 { "field": "${fieldName}", "in": [1, 2, 3] }（收到 ${describeValue(step.in)}）。`,
        )
      }
      return plan
    }
    case 'count':
      return plan
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const fieldName = readString(step, 'field')
      if (!fieldName) throw new Error(`${op} 需要 field（对哪个字段做 ${op}）。`)
      const spec = requireField(fields, fieldName, op)
      assertAggregatable(fields, spec, fieldName, op, op)
      plan.aggFn = op
      plan.aggFieldName = fieldName
      plan.aggSpec = spec
      return plan
    }
    case 'groupBy': {
      const byName = readString(step, 'by')
      if (!byName) {
        throw new Error('groupBy 需要 by（按哪个字段分组）。字段名见 get_page_data 的 fields。')
      }
      const bySpec = requireField(fields, byName, 'groupBy')
      if (bySpec.sensitive) {
        throw new Error(
          `groupBy 不能按敏感字段 ${byName} 分组：分组结果的键就是敏感值原文，会把它带回对话。请改用非敏感字段（如状态、类型）。`,
        )
      }

      const fn = readAggFn(step)
      const aggFieldName = readString(step, 'field')
      if (fn !== 'count' && !aggFieldName) {
        throw new Error(`groupBy 的 fn=${fn} 需要 field（对哪个字段做 ${fn}）。`)
      }
      if (fn !== 'count') {
        /*
          提前校验聚合目标字段（桶可能是空的，不能让「字段没注解 / 类型不对」
          被空数据掩盖）—— 复用的是与顶层 sum/avg 同一份规则。
        */
        const name = aggFieldName as string
        const aggSpec = requireField(fields, name, 'groupBy')
        assertAggregatable(fields, aggSpec, name, fn, `groupBy 的 ${fn}`)
        plan.aggFieldName = name
        plan.aggSpec = aggSpec
      }

      plan.aggFn = fn
      plan.byName = byName
      plan.bySpec = bySpec
      return plan
    }
    case 'sort': {
      const fieldName = readString(step, 'field')
      if (!fieldName) throw new Error('sort 需要 field（按哪个字段排序）。')
      const spec = requireField(fields, fieldName, 'sort')
      assertOrderable(spec, fieldName)
      plan.fieldName = fieldName
      plan.spec = spec
      plan.order = readOrder(step)
      return plan
    }
    case 'topN': {
      const fieldName = readString(step, 'field')
      if (!fieldName) throw new Error('topN 需要 field（按哪个字段取前 N）与 limit。')
      const spec = requireField(fields, fieldName, 'topN')
      assertOrderable(spec, fieldName)
      const limit = readLimit(step, 'topN')
      if (limit === undefined) {
        throw new Error(
          `topN 需要 limit（1~${MAX_RESULT_ROWS} 的整数），例如 { "op": "topN", "field": "${fieldName}", "limit": 10 }。`,
        )
      }
      plan.fieldName = fieldName
      plan.spec = spec
      // topN 缺省按降序（"最大的 N 条"），与 sort 的缺省 asc 相反 —— 这是它的语义。
      plan.order = step.order === undefined ? 'desc' : readOrder(step)
      plan.limit = limit
      return plan
    }
    case 'distinct': {
      const fieldName = readString(step, 'field')
      if (!fieldName) throw new Error('distinct 需要 field（要去重的字段）。')
      const spec = requireField(fields, fieldName, 'distinct')
      if (spec.sensitive) {
        throw new Error(
          `distinct 不能用于敏感字段 ${fieldName}：返回的就是该字段的值原文。请改用非敏感字段。`,
        )
      }
      plan.fieldName = fieldName
      plan.spec = spec
      plan.limit = readLimit(step, 'distinct')
      return plan
    }
  }
}

/**
 * 聚合目标字段的公共规则：**敏感拒绝** + **类型可聚合**。
 *
 * 敏感字段的聚合值同样不进返回值：`sum(phone)` / `avg(salary)` 会反推出接近原文的
 * 数量级，属于曲线泄露（§3.7）。`filter` 用敏感字段则允许 —— 比较不暴露值。
 */
function assertAggregatable(
  fields: Map<string, FeatureDataFieldSpec>,
  spec: FeatureDataFieldSpec,
  name: string,
  fn: AggFn,
  label: string,
): void {
  if (spec.sensitive) {
    throw new Error(
      `${label} 不能作用于敏感字段 ${name}（聚合结果可能反推出敏感值）。请改用非敏感字段，或让用户自己查看。`,
    )
  }
  if (fn === 'sum' || fn === 'avg') {
    if (spec.type !== 'number') {
      throw new Error(
        `${label} 只能用于 number 字段：${name} 的类型是 ${spec.type}。可用的是：${describeFields(fields)}`,
      )
    }
    return
  }
  if (spec.type === 'boolean') {
    throw new Error(
      `${label} 不支持 boolean 字段：${name}。布尔值只能计数或按 eq 筛选，请改用 count。`,
    )
  }
}

function assertOrderable(spec: FeatureDataFieldSpec, name: string): void {
  if (spec.type === 'boolean') {
    throw new Error(`排序不支持 boolean 字段：${name}。布尔值没有大小，请改用 count 或 filter。`)
  }
}

/** 标量必须是最后一步 —— 否则后面的操作会作用在一个值上，语义不成立。 */
function assertScalarIsLast(op: Op, index: number, isLast: boolean): void {
  if (!isLast && SCALAR_OPS.includes(op)) {
    throw new Error(
      `pipeline 第 ${index + 1} 步 ${op} 产出的是**单个值**，后面不能再接操作。请把它留作最后一步，需要分组统计就用 groupBy。`,
    )
  }
}

/**
 * groupBy 之后的字段集：by 字段（继承原类型）+ 聚合结果 `value` / `count`。
 * 于是 `sort` / `topN` / `filter` 可以接在分组结果上（如按 count 排序取前 10）。
 */
function groupResultFields(plan: StepPlan): Map<string, FeatureDataFieldSpec> {
  const byName = plan.byName as string
  const bySpec = plan.bySpec as FeatureDataFieldSpec
  return new Map<string, FeatureDataFieldSpec>([
    [byName, { ...bySpec, sensitive: false }],
    ['value', { name: 'value', label: `${plan.aggFn} 结果`, type: 'number' }],
    ['count', { name: 'count', label: '分组内行数', type: 'number' }],
  ])
}

/**
 * **审批前的静态预检**：把整条 pipeline 解析一遍（含 groupBy 之后的字段集演进），
 * 只校验字段注解 / 类型 / limit / 顺序，**不读数据**。
 *
 * 目的：注定失败的调用不弹确认卡、不打扰用户（与 `check_result_match` 同一约定）。
 */
function validatePipeline(
  fields: Map<string, FeatureDataFieldSpec>,
  pipeline: Record<string, unknown>[],
): void {
  let currentFields = fields
  for (let index = 0; index < pipeline.length; index += 1) {
    const step = pipeline[index]
    const op = readOp(step, index)
    const plan = planStep(currentFields, step, op)
    assertScalarIsLast(op, index, index === pipeline.length - 1)
    if (op === 'groupBy') currentFields = groupResultFields(plan)
  }
}

function evaluate(stage: Stage, pipeline: Record<string, unknown>[]): unknown {
  let current = stage
  let scalar: unknown = undefined
  let scalarOp: Op | null = null

  for (let index = 0; index < pipeline.length; index += 1) {
    const step = pipeline[index]
    const op = readOp(step, index)
    // 复用同一份静态规则（此时字段集可能已被 groupBy 替换过）
    const plan = planStep(current.fields, step, op)
    assertScalarIsLast(op, index, index === pipeline.length - 1)

    switch (op) {
      case 'filter':
        current = { ...current, rows: applyFilter(current.rows, plan) }
        break
      case 'count':
        scalar = current.rows.length
        scalarOp = op
        break
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
        scalar = aggregate(current.rows, plan)
        scalarOp = op
        break
      case 'groupBy':
        current = applyGroupBy(current, plan)
        break
      case 'sort':
        current = { ...current, rows: applySort(current.rows, plan) }
        break
      case 'topN':
        current = { ...current, rows: applyTopN(current.rows, plan) }
        break
      case 'distinct':
        scalar = applyDistinct(current.rows, plan)
        scalarOp = op
        break
    }
  }

  if (scalarOp) return scalar
  return projectRows(current.rows, current.fields)
}

function readOp(step: Record<string, unknown>, index: number): Op {
  const raw = step.op
  if (typeof raw !== 'string' || !(OPS as readonly string[]).includes(raw)) {
    throw new Error(
      `pipeline 第 ${index + 1} 步的 op 无效：${describeValue(raw)}。可用的是：${OPS.join(' / ')}。`,
    )
  }
  return raw as Op
}

/* ------------------------------- filter ------------------------------- */

function applyFilter(rows: Row[], plan: StepPlan): Row[] {
  // planStep 已保证这三个字段存在（这里是执行侧，不重复校验规则）
  const fieldName = plan.fieldName as string
  const spec = plan.spec as FeatureDataFieldSpec
  const conditions = plan.conditions as Array<{ comparator: Comparator; expected: unknown }>
  return rows.filter((row) =>
    conditions.every((condition) =>
      matchesValue(row[fieldName], condition.expected, condition.comparator, spec),
    ),
  )
}

/** 值比较；条件本身已由 `planStep` 静态校验过，这里只做数据驱动的判定。 */
function matchesValue(
  actual: unknown,
  expected: unknown,
  comparator: Comparator,
  spec: FeatureDataFieldSpec,
): boolean {
  if (comparator === 'in') {
    return Array.isArray(expected)
      ? expected.some((candidate) => valuesEqual(actual, candidate, spec.type))
      : false
  }

  if (comparator === 'contains') {
    return toDisplayText(actual).includes(toDisplayText(expected))
  }

  if (comparator === 'eq') return valuesEqual(actual, expected, spec.type)
  if (comparator === 'neq') return !valuesEqual(actual, expected, spec.type)

  const compared = compareValues(actual, expected, spec.type)
  if (compared === null) return false
  switch (comparator) {
    case 'gt':
      return compared > 0
    case 'gte':
      return compared >= 0
    case 'lt':
      return compared < 0
    case 'lte':
      return compared <= 0
    default:
      return false
  }
}

/* ------------------------------ 聚合 ------------------------------ */

function aggregate(rows: Row[], plan: StepPlan): number | string {
  const fn = plan.aggFn
  if (fn === 'count') return rows.length

  // planStep 已保证聚合字段存在、非敏感、类型可聚合
  const spec = plan.aggSpec as FeatureDataFieldSpec
  const fieldName = plan.aggFieldName as string

  if (fn === 'sum' || fn === 'avg') {
    const values = rows
      .map((row) => Number(row[fieldName]))
      .filter((value) => Number.isFinite(value))
    if (fn === 'sum') return values.reduce((total, value) => total + value, 0)
    if (values.length === 0) {
      throw new Error(
        `${fieldName} 没有可计算的数字（过滤后 0 行），avg 无法得出结果。请先放宽 filter，或改用 count。`,
      )
    }
    return values.reduce((total, value) => total + value, 0) / values.length
  }

  // min / max：number、datetime、string / enum 可比较（boolean 已在校验时拒绝）。
  let best: unknown = undefined
  let hasCandidate = false
  for (const row of rows) {
    const value = row[fieldName]
    if (value === undefined || value === null || value === '') continue
    if (!hasCandidate) {
      best = value
      hasCandidate = true
      continue
    }
    const compared = compareValues(value, best, spec.type)
    if (compared === null) continue
    if ((fn === 'min' && compared < 0) || (fn === 'max' && compared > 0)) {
      best = value
    }
  }

  if (!hasCandidate) {
    const label = plan.byName ? `groupBy 的 ${fn}` : fn
    throw new Error(`过滤后没有可用于 ${label} 的 ${fieldName} 值。请先放宽 filter，或改用 count。`)
  }

  if (spec.type === 'datetime') {
    const timestamp = toTimestamp(best)
    return timestamp === null ? String(best) : new Date(timestamp).toISOString()
  }
  return typeof best === 'number' ? best : String(best)
}

/* ------------------------------ groupBy ------------------------------ */

function applyGroupBy(stage: Stage, plan: StepPlan): Stage {
  // planStep 已保证 by / fn / 聚合字段全部合法（含敏感与类型）
  const byName = plan.byName as string

  const groups = new Map<string, { key: unknown; rows: Row[] }>()
  for (const row of stage.rows) {
    const value = row[byName]
    // 空值不参与分组：否则「缺失」会被当成一个真实分组，计数对不上。
    if (value === undefined || value === null) continue
    const key = groupKey(value)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.rows.push(row)
    } else {
      groups.set(key, { key: value, rows: [row] })
    }
  }

  const out: Row[] = [...groups.values()].map((group) => ({
    [byName]: group.key,
    value: aggregate(group.rows, plan),
    count: group.rows.length,
  }))
  return { rows: out, fields: groupResultFields(plan) }
}

function readAggFn(step: Record<string, unknown>): AggFn {
  const raw = step.fn
  if (raw === undefined) return 'count'
  if (typeof raw !== 'string' || !(AGG_FNS as readonly string[]).includes(raw)) {
    throw new Error(
      `groupBy 的 fn 无效：${describeValue(raw)}。可用的是：${AGG_FNS.join(' / ')}（缺省 count）。`,
    )
  }
  return raw as AggFn
}

/* --------------------------- sort / topN --------------------------- */

function applySort(rows: Row[], plan: StepPlan): Row[] {
  return sortRows(rows, plan.fieldName as string, plan.spec as FeatureDataFieldSpec, plan.order)
}

function applyTopN(rows: Row[], plan: StepPlan): Row[] {
  return sortRows(
    rows,
    plan.fieldName as string,
    plan.spec as FeatureDataFieldSpec,
    plan.order,
  ).slice(0, plan.limit as number)
}

function sortRows(
  rows: Row[],
  fieldName: string,
  spec: FeatureDataFieldSpec,
  order: 'asc' | 'desc',
): Row[] {
  const factor = order === 'desc' ? -1 : 1
  // 复制后再排序：不能改页面数据源返回的数组（那可能正是页面自己持有的引用）。
  return [...rows].sort((left, right) => {
    const compared = compareValues(left[fieldName], right[fieldName], spec.type)
    if (compared === null) return 0
    return compared * factor
  })
}

function readOrder(step: Record<string, unknown>): 'asc' | 'desc' {
  const raw = step.order
  if (raw === undefined) return 'asc'
  if (raw === 'asc' || raw === 'desc') return raw
  throw new Error(`order 只能是 asc 或 desc（收到 ${describeValue(raw)}）。`)
}

function readLimit(step: Record<string, unknown>, opLabel: string): number | undefined {
  const raw = step.limit
  if (raw === undefined) return undefined
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`${opLabel} 的 limit 必须是 ≥1 的整数（收到 ${describeValue(raw)}）。`)
  }
  if (raw > MAX_RESULT_ROWS) {
    throw new Error(
      `${opLabel} 的 limit 最大 ${MAX_RESULT_ROWS}（收到 ${raw}）。请缩小到 ${MAX_RESULT_ROWS} 以内，或先用 filter 收窄数据。`,
    )
  }
  return raw
}

/* ----------------------------- distinct ----------------------------- */

function applyDistinct(rows: Row[], plan: StepPlan): unknown[] {
  // planStep 已保证 field 存在、非敏感，limit 合法（可选）
  const fieldName = plan.fieldName as string

  const seen = new Set<string>()
  const values: unknown[] = []
  for (const row of rows) {
    const value = row[fieldName]
    if (value === undefined) continue
    const key = groupKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }

  const sliced = plan.limit === undefined ? values : values.slice(0, plan.limit)
  if (sliced.length > MAX_RESULT_ROWS) {
    throw new Error(
      `distinct 结果有 ${sliced.length} 项，超过 ${MAX_RESULT_ROWS} 项上限。请先用 filter 收窄，或给 distinct 加 limit（≤${MAX_RESULT_ROWS}）。`,
    )
  }
  return sliced
}

/* --------------------------- 字段 / 比较工具 --------------------------- */

function requireField(
  fields: Map<string, FeatureDataFieldSpec>,
  name: string,
  opLabel: string,
): FeatureDataFieldSpec {
  const spec = fields.get(name)
  if (!spec) {
    throw new Error(
      `${opLabel} 用到的字段 ${name} 不在这个数据源已注解的字段里。可用的是：${describeFields(fields)}。请不要猜字段名 —— 字段列表以 get_page_data 的 fields 为准。`,
    )
  }
  return spec
}

/** 宽松相等：按注解类型归一后再比（`1` 与 `"1"`、时间戳与 ISO 串都算同一个值）。 */
function valuesEqual(
  actual: unknown,
  expected: unknown,
  type: FeatureDataFieldSpec['type'],
): boolean {
  if (type === 'number') {
    const left = Number(actual)
    const right = Number(expected)
    return Number.isFinite(left) && Number.isFinite(right) && left === right
  }
  if (type === 'datetime') {
    const left = toTimestamp(actual)
    const right = toTimestamp(expected)
    return left !== null && right !== null && left === right
  }
  return String(actual) === String(expected)
}

/** 排序 / 大小比较；不可比（空值、非法日期、非数字）返回 null。 */
function compareValues(
  actual: unknown,
  expected: unknown,
  type: FeatureDataFieldSpec['type'],
): number | null {
  if (type === 'number') {
    const left = Number(actual)
    const right = Number(expected)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null
    return left === right ? 0 : left < right ? -1 : 1
  }
  if (type === 'datetime') {
    const left = toTimestamp(actual)
    const right = toTimestamp(expected)
    if (left === null || right === null) return null
    return left === right ? 0 : left < right ? -1 : 1
  }
  if (type === 'boolean') return null
  const left = toDisplayText(actual)
  const right = toDisplayText(expected)
  return left === right ? 0 : left < right ? -1 : 1
}

/** datetime 一律按**时间戳**比较与排序（规范 §1.5 第 2 条）。 */
function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : time
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^-?\d+$/.test(trimmed)) {
      const time = Number(trimmed)
      return Number.isFinite(time) ? time : null
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/* ------------------------------ 输出 ------------------------------ */

/**
 * 把最终行投影成**可带出对话的形状**。
 *
 * 只保留**已注解**的字段，并剔除敏感字段：未注解的字段 AI 本来就不该看到
 * （§1.1「未注解的字段 AI 不可用」），敏感字段的值永远不进返回值（§3.7）。
 */
function projectRows(rows: Row[], fields: Map<string, FeatureDataFieldSpec>): Row[] {
  const visible = [...fields.values()].filter((field) => !field.sensitive)
  const projected = rows.map((row) => {
    const out: Row = {}
    for (const field of visible) {
      const value = row[field.name]
      if (value === undefined) continue
      out[field.name] = value
    }
    return out
  })

  if (projected.length > MAX_RESULT_ROWS) {
    throw new Error(
      `结果是 ${projected.length} 行，超过 ${MAX_RESULT_ROWS} 行上限。请先用 filter / topN 收窄，或改用 count / sum 这类聚合只取标量。`,
    )
  }
  return projected
}

/* ------------------------------ 小工具 ------------------------------ */

function readString(step: Record<string, unknown>, key: string): string | undefined {
  const value = step[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function groupKey(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'object') {
    const timestamp = value instanceof Date ? toTimestamp(value) : null
    if (timestamp !== null) return `date:${timestamp}`
    try {
      return `json:${JSON.stringify(value)}`
    } catch {
      // 循环引用等情况 JSON.stringify 会抛：退回对象自身的类型标签（显式转换，避免隐式 `[object Object]`）
      return `object:${Object.prototype.toString.call(value)}`
    }
  }
  return `${typeof value}:${toDisplayText(value)}`
}

function describeFields(fields: Map<string, FeatureDataFieldSpec>): string {
  const list = [...fields.values()].map(
    (field) => `${field.name}（${field.label}，${field.type}${field.sensitive ? '，敏感' : ''}）`,
  )
  return list.length > 0 ? list.join(' / ') : '（无）'
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return '数组'
  return typeof value
}
