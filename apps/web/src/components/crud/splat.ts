import type { CrudSplatMatch } from './types'

export interface MatchCrudSplatOptions {
  enableDetail?: boolean
}

/**
 * 校验并解析 Splat 路由参数
 * - 'new' -> { type: 'create' }
 * - ':id/edit' -> { type: 'edit', id }
 * - ':id' -> { type: 'detail', id } (当 enableDetail !== false 时)
 * - 其它不合法路径返回 null
 */
export function matchCrudSplat(
  splat: string | undefined,
  options?: MatchCrudSplatOptions,
): CrudSplatMatch | null {
  if (!splat) return null
  const trimmed = splat.replace(/^\/+|\/+$/g, '')
  if (!trimmed) return null

  if (trimmed === 'new') {
    return { type: 'create' }
  }

  const editMatch = trimmed.match(/^([^/]+)\/edit$/)
  if (editMatch) {
    return { type: 'edit', id: decodeURIComponent(editMatch[1]) }
  }

  if (options?.enableDetail !== false) {
    const detailMatch = trimmed.match(/^([^/]+)$/)
    if (detailMatch) {
      return { type: 'detail', id: decodeURIComponent(detailMatch[1]) }
    }
  }

  return null
}
