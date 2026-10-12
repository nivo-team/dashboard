import type { CrudSplatMatch } from './types'

export interface MatchCrudSplatOptions {
  enableDetail?: boolean
  /** 允许携带 query 中的 type 参数辅助决议（如 ?type=edit） */
  type?: string | null
}

/** 受保护的固定子路由保留字（不能被当作普通动态 :id 解析） */
export const RESERVED_SPLAT_KEYWORDS = new Set(['new', 'edit'])

/**
 * 校验并解析 Splat 路由参数
 * - 'new' -> { type: 'create' }（保护路径）
 * - ':id/edit' -> { type: 'edit', id }
 * - ':id' ->
 *     - 若携带 ?type=edit，解析为 { type: 'edit', id }
 *     - 若 enableDetail !== false，解析为 { type: 'detail', id }
 * - 保留关键字（如单独的 'edit' 无 id）或其它不合法路径返回 null（触发 notFound）
 */
export function matchCrudSplat(
  splat: string | undefined,
  options?: MatchCrudSplatOptions,
): CrudSplatMatch | null {
  if (!splat) return null
  const trimmed = splat.replace(/^\/+|\/+$/g, '')
  if (!trimmed) return null

  // 1. 保护路径：新建
  if (trimmed === 'new') {
    return { type: 'create' }
  }

  // 2. 保护路径：孤立的 'edit'（无 id 实体），属于非法保护路径，返回 null 触发 notFound
  if (trimmed === 'edit') {
    return null
  }

  // 3. 经典子路径编辑：:id/edit
  const editMatch = trimmed.match(/^([^/]+)\/edit$/)
  if (editMatch) {
    const rawId = decodeURIComponent(editMatch[1])
    if (RESERVED_SPLAT_KEYWORDS.has(rawId)) return null
    return { type: 'edit', id: rawId }
  }

  // 4. 单层动态标识符 :id
  const singleSegmentMatch = trimmed.match(/^([^/]+)$/)
  if (singleSegmentMatch) {
    const rawId = decodeURIComponent(singleSegmentMatch[1])
    if (RESERVED_SPLAT_KEYWORDS.has(rawId)) return null

    // 若通过 query 指定了 ?type=edit，识别为指定 id 的编辑模式
    if (options?.type === 'edit') {
      return { type: 'edit', id: rawId }
    }

    // 默认作为详情查看
    if (options?.enableDetail !== false) {
      return { type: 'detail', id: rawId }
    }
  }

  // 其它多层未定义路径（如 /10001/unknown），返回 null 触发 notFound
  return null
}
