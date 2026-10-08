import type { QueryFilterField } from '#/api'
import type { FilterCondition } from '#/components/table-controls'
import { toDisplayText } from '#/lib/to-text'

/**
 * 把当前 URL/QueryState 还原成 FilterCondition 数组，供 FilterBuilder 和 ActiveFilterChips 使用
 */
export function queryToFilterConditions(
  query: Record<string, unknown>,
  fields: readonly QueryFilterField[],
): FilterCondition[] {
  const conditions: FilterCondition[] = []

  for (const field of fields) {
    if (field.control === 'number-range') {
      const minVal = query[field.param]
      const maxVal = field.paramTo ? query[field.paramTo] : undefined
      const hasMin = minVal !== undefined && minVal !== null && minVal !== ''
      const hasMax = maxVal !== undefined && maxVal !== null && maxVal !== ''
      if (hasMin || hasMax) {
        conditions.push({
          id: `cond_${field.param}`,
          field: field.param,
          value: hasMin ? toDisplayText(minVal) : '',
          valueTo: hasMax ? toDisplayText(maxVal) : '',
        })
      }
    } else {
      const val = query[field.param]
      if (val !== undefined && val !== null && val !== '') {
        conditions.push({
          id: `cond_${field.param}`,
          field: field.param,
          value: toDisplayText(val),
        })
      }
    }
  }

  return conditions
}

/**
 * 把 FilterCondition 数组转换为需要更新到 URL Query 的 patch。
 * 已被移除的筛选字段值将被置为 null，由 nuqs 自动从 URL 中清理。
 */
export function filterConditionsToQueryPatch(
  conditions: FilterCondition[],
  fields: readonly QueryFilterField[],
  allFilterKeys: readonly string[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  // 1. 初始化所有已声明的筛选键为 null（未在 conditions 出现的会被移除）
  for (const key of allFilterKeys) {
    patch[key] = null
  }

  // 2. 按生效条件填充取值
  const byParam = new Map(fields.map((f) => [f.param, f]))

  for (const condition of conditions) {
    const field = byParam.get(condition.field)
    if (!field) continue

    if (field.control === 'number-range') {
      const from = condition.value.trim()
      const to = (condition.valueTo ?? '').trim()
      patch[field.param] = from ? Number(from) : null
      if (field.paramTo) {
        patch[field.paramTo] = to ? Number(to) : null
      }
      continue
    }

    const val = condition.value.trim()
    if (!val) {
      patch[field.param] = null
      continue
    }

    if (field.control === 'number') {
      const num = Number(val)
      patch[field.param] = Number.isFinite(num) ? num : null
    } else if (field.control === 'boolean') {
      patch[field.param] = val === 'true'
    } else {
      patch[field.param] = val
    }
  }

  return patch
}
