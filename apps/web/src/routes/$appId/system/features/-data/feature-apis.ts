import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { getApiQueryOptions } from '#/api'
import type { ApiItem } from '#/api'

/**
 * 系统接口清单（`GET /api`，baseUrl 已含 `/api` 所以实际是 `/api/api`）。
 *
 * 实测返回约 632 条 `{ method, path, value, label }`，`api_keys` 里存的就是其中的 `value`（md5）。
 *
 * ⏳ 量级假设：632 条是测试环境实测值（2026-09），`FeatureApiKeysField` 的「只渲染前 50 条」
 * 是按这个量级定的；若接口量级大幅变化，需要重新评估那个上限。
 * 清单是静态路由表，因此统一用较长的 `staleTime`，整个会话只拉取一次、跨组件共享缓存。
 *
 * 同一份清单在本模块有两个用途：
 * - 表单里作为「绑定接口」的候选（`FeatureApiKeysField`）；
 * - 详情/列表展示时把 `api_keys` 的 md5 还原成可读 label（`useApiKeyLabel`）。
 */

/** 接口清单的缓存时长：静态路由表，30 分钟内不重复请求。 */
export const API_LIST_STALE_TIME = 30 * 60 * 1000

/** 读取系统接口清单。 */
export function useApiItems() {
  const query = useQuery({
    ...getApiQueryOptions(),
    staleTime: API_LIST_STALE_TIME,
  })

  const items = useMemo<ApiItem[]>(() => query.data?.result ?? [], [query.data])

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
  }
}

/**
 * 返回 `api_keys` 的展示函数：md5 → 可读 label。
 *
 * 清单里查不到的（历史数据 / 接口已下线）原样返回 md5，避免静默丢信息。
 */
export function useApiKeyLabel(): (key: string) => string {
  const { items } = useApiItems()

  const table = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (item.value) map.set(item.value, item.label || item.value)
    }
    return map
  }, [items])

  return useCallback((key: string) => table.get(key) ?? key, [table])
}
