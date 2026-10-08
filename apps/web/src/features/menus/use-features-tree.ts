import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { getSystemMenuTreeQueryKey, getSystemMenuTreeQueryOptions } from '#/api'
import type { MenuNode } from '#/api'
import { DEMO_FEATURES } from './demo-features'
import { MENU_ROOT_ID, findMenuById } from './feature-options'

/**
 * 功能模块的单一数据源。
 *
 * 全模块只发一个请求：`GET /system/menu/tree?menu_id=482`。
 * 实测该接口返回 482 的**直接子节点数组**，后代已经嵌在各自的 `children` 里
 * （整棵新架构功能树约 1.2KB），因此容器视图、详情视图与创建表单都从这一棵树上派生：
 *
 * - 容器视图取某个节点的 `children` 作为表格数据；
 * - 详情视图取节点自身的基本信息 + `children`；
 * - 路由分流按节点自身的 `menu_type` 决定渲染容器视图还是详情视图；
 * - 页面内面包屑用 `findMenuPath` 的祖先链还原层级。
 *
 * 好处是 queryKey 只有一个：创建成功后的失效、刷新按钮、以及跨视图共享缓存都不需要额外协调。
 * 旧系统的整棵树永远不会被带出来 —— 请求恒定携带 `MENU_ROOT_ID`。
 */
export function useFeaturesTree() {
  const query = useQuery(getSystemMenuTreeQueryOptions({ query: { menu_id: MENU_ROOT_ID } }))

  const apiNodes = useMemo(() => query.data?.result ?? [], [query.data])

  /** 演示兜底：接口不可用（未连后端 / 凭据失效）时，用本地演示数据模拟同一返回形态。 */
  const demoNodes = useMemo(() => findMenuById(DEMO_FEATURES, MENU_ROOT_ID)?.children ?? [], [])

  const isDemoMode = query.isError && apiNodes.length === 0

  return {
    /** 根节点（482）的直接子节点；整棵新架构功能树都嵌在其中。 */
    nodes: (isDemoMode ? demoNodes : apiNodes) as MenuNode[],
    /** 是否处于演示数据模式（接口失败且无数据）。 */
    isDemoMode,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * 失效整棵功能树缓存。
 *
 * 用不带参数的 `getSystemMenuTreeQueryKey()` 作为前缀键：生成的 key 第一段是
 * `{ _id: 'getSystemMenuTree', baseUrl }`，TanStack Query 的前缀匹配会忽略实际查询里的
 * `query: { menu_id }`，因此一次调用即可覆盖所有 `menu_id` 取值的缓存。
 */
export function useInvalidateFeaturesTree() {
  const queryClient = useQueryClient()

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: getSystemMenuTreeQueryKey() }),
    [queryClient],
  )
}
