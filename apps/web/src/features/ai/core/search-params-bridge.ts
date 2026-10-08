import { useEffect, useRef } from 'react'

/**
 * 页面搜索参数桥（Search Params Bridge）。
 *
 * 让 AI 能够通过结构化参数（如关键词 kw、筛选条件、排序、分页）直接驱动前端页面搜索状态。
 *
 * 桥接原理：
 * 1. 采用 useTableQuery 的列表页自动注册自己的 setRawQuery 调度器；
 * 2. 当 AI 调用 update_search_params 工具时，优先通过注册的调度器执行原子更新；
 * 3. 若当前页面尚未挂载或无本地调度器，回退至通过 TanStack Router 导航更新 URL。
 */

export type SearchParamsUpdater = (patch: Record<string, unknown>) => Promise<unknown> | unknown

let currentUpdater: SearchParamsUpdater | null = null

export function registerSearchParamsUpdater(updater: SearchParamsUpdater): () => void {
  currentUpdater = updater
  return () => {
    if (currentUpdater === updater) currentUpdater = null
  }
}

/**
 * 更新当前页面的搜索参数
 * @returns boolean 是否由本地已注册的调度器成功接收
 */
export function updatePageSearchParams(patch: Record<string, unknown>): boolean {
  if (currentUpdater) {
    try {
      void currentUpdater(patch)
      return true
    } catch {
      return false
    }
  }
  return false
}

/**
 * 由列表页组件或 useTableQuery 调用：注册当前页面的搜索参数更新闭包
 */
export function useAiSearchParamsUpdater(updater: SearchParamsUpdater | null): void {
  const ref = useRef(updater)
  ref.current = updater

  useEffect(() => {
    if (!ref.current) return
    return registerSearchParamsUpdater((patch) => ref.current?.(patch))
  }, [])
}
