import type { ComplexTableRow } from './data'
import { COMPLEX_TABLE_FILTER_FIELDS } from './filter-fields'

/**
 * 把 URL 里的筛选参数应用到本地数据上。
 *
 * 这一页没有接口，所以筛选在前端做 —— 但**参数形状与真实接口页完全一致**
 * （`customer_name=云曦` / `amount_min=1000`），因此接真实后端时只需把
 * `filterRows()` 换成「把 `queryParams` 交给 query」，筛选器与 URL 状态一行都不用改。
 *
 * 匹配语义按控件类型分：
 * - `text`：不区分大小写的**包含**匹配（真实后端通常是 `LIKE`）；
 * - `enum` / `boolean`：**精确**匹配；
 * - `number` / `number-range`：数值比较，`param` 是下界、`paramTo` 是上界（闭区间）。
 */
export function filterRows(
  rows: readonly ComplexTableRow[],
  query: Record<string, unknown>,
): ComplexTableRow[] {
  // 只挑出本页声明过的筛选参数，避免 `page` / `kw` 这类主参数混进来
  const active = COMPLEX_TABLE_FILTER_FIELDS.filter(
    (field) =>
      query[field.param] !== undefined &&
      query[field.param] !== null &&
      query[field.param] !== '',
  )

  if (!active.length) return [...rows]

  return rows.filter((row) =>
    active.every((field) => {
      const raw = query[field.param]
      // 区间字段的上界（仅 number-range）
      const rawTo = field.paramTo ? query[field.paramTo] : undefined

      switch (field.control) {
        case 'number':
        case 'number-range': {
          const value = Number(readField(row, field.name) ?? 0)
          const from = Number(raw)
          if (!Number.isNaN(from) && value < from) return false
          if (rawTo !== undefined && rawTo !== null && rawTo !== '') {
            const to = Number(rawTo)
            if (!Number.isNaN(to) && value > to) return false
          }
          return true
        }
        case 'enum':
        case 'boolean': {
          const value = String(readField(row, field.name) ?? '')
          return value === String(raw)
        }
        default: {
          // text / array：包含匹配
          const value = String(readField(row, field.name) ?? '')
          return value.toLowerCase().includes(String(raw).toLowerCase())
        }
      }
    }),
  )
}

/**
 * 按字段名取值。
 *
 * 不写 `row as Record<string, unknown>` —— 那是把具体类型硬转成索引签名，
 * TS 会判为「两边没有足够重叠」而报错。字段名来自筛选目录（运行时才知道），
 * 只能动态取，于是用一个窄的辅助函数把类型断言收在一处。
 */
function readField(row: ComplexTableRow, name: string): unknown {
  return (row as unknown as Record<string, unknown>)[name]
}
