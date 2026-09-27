import type { H3Event } from 'nitro'
import { getQuery } from 'nitro/h3'

/**
 * 查询参数解析工具。
 *
 * 全部**从宽处理**：前端传了不认识的参数就忽略，分页参数缺省时给合理默认值。
 * 这样前端调整筛选条件时不会因为 Mock 没跟上而报错。
 */

export interface PageQuery {
  page: number
  pageSize: number
}

/** 取一个字符串查询参数（空串按未传处理）。 */
export function readString(event: H3Event, name: string): string | undefined {
  const value = getQuery(event)[name]
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text === '' ? undefined : text
}

/** 取一个数字查询参数（无法解析按未传处理）。 */
export function readNumber(event: H3Event, name: string): number | undefined {
  const value = readString(event, name)
  if (value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

/**
 * 内存分页切片。
 *
 * 第二参数放宽成 `unknown` 结构：调用方既可能传解析过的数字，也可能直接
 * 把 h3 的 `getQuery(event)`（值都是字符串）丢进来，两者都应能工作。
 */
export function paginate<T>(
  rows: T[],
  query: Record<string, unknown> = {},
): { total: number; items: T[] } {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size) || 10))
  const start = (page - 1) * pageSize
  return { total: rows.length, items: rows.slice(start, start + pageSize) }
}
