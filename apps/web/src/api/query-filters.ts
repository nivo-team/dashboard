import type { QueryFilterField } from './query-params.gen'

/** 筛选条件的纯数据部分（与 FilterBuilder 的 FilterCondition 对齐，去掉行 id） */
export interface QueryFilterValue {
  /** 真实的 query 参数名（区间字段为其下限参数） */
  field: string
  value: string
  valueTo?: string
}

/**
 * 把筛选条件映射为接口的 query 参数。
 *
 * 后端是扁平的具名参数，因此这里按字段目录的控件类型做转换：
 * - number-range → 拆成 xxx_min / xxx_max 两个数字参数
 * - array        → 逗号分隔值拆成数组，数字字段转 number
 * - boolean      → 'true' / 'false' 转布尔
 * - number       → 转数字
 * - enum / text  → 原样传入
 *
 * 空值、非法数字、未知字段一律跳过，避免向后端发出无效参数。
 */
export function buildQueryFromFilters(
  conditions: QueryFilterValue[],
  fields: QueryFilterField[],
): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  // 按真实 query 参数名索引（区间字段以其下限参数作为 key）
  const byParam = new Map(fields.map((field) => [field.param, field]))

  for (const condition of conditions) {
    const field = byParam.get(condition.field)
    if (!field) continue

    if (field.control === 'number-range') {
      const from = toFiniteNumber(condition.value)
      const to = toFiniteNumber(condition.valueTo)
      if (from !== undefined) query[field.param] = from
      if (to !== undefined && field.paramTo) query[field.paramTo] = to
      continue
    }

    if (condition.value === '') continue

    switch (field.control) {
      case 'boolean':
        query[field.param] = condition.value === 'true'
        break

      case 'array': {
        const items = condition.value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '')
        if (items.length === 0) break
        query[field.param] =
          field.itemType === 'number'
            ? items.map(Number).filter((item) => Number.isFinite(item))
            : items
        break
      }

      case 'number': {
        const value = toFiniteNumber(condition.value)
        if (value !== undefined) query[field.param] = value
        break
      }

      default:
        query[field.param] = condition.value
    }
  }

  return query
}

/** 把输入值转为有限数字，空值或非法值返回 undefined */
function toFiniteNumber(value?: string): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
