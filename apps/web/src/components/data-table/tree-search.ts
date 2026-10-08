import { useEffect, useMemo, useState } from 'react'
import type { ExpandedState } from '@tanstack/react-table'
import { buildTreeSearchExpanded } from '#/lib/tree-search'
import type { TreeAccessor, TreeExpandedMap } from '#/lib/tree-search'

/**
 * 树形表格的「展开态」hook（`DataTable` 树表的配套能力）。
 *
 * 过滤用的是 `#/lib/tree-search` 的 `filterTreeByMatch`（纯函数，数据层也能用）；
 * 本文件只负责展开态的派生与交互：
 *
 * - **默认折叠** → 搜索时展开过滤结果里的每个分支 → 清空关键词回到折叠；
 * - 搜索期间用户仍可单独折叠某个分支（手动操作优先）；
 * - 支持受控（页面自己管理展开态时传 `controlledExpanded`）。
 *
 * ⚠️ 不要用 TanStack Table v9 的 `expanded: true`（「全部展开」特例）——
 * 实测它在本仓库的 features 组合下不会把子行摊开；按行 id 展开与用户手点箭头
 * 是同一条路径，行为确定。
 */

export interface UseTreeSearchExpandedOptions<TData> {
  /** 过滤后的节点（用于生成搜索态的展开映射）。 */
  filteredNodes: TData[]
  /** 当前搜索关键词（空串 = 非搜索态）。 */
  keyword: string
  /** 与表格一致的子节点访问器。 */
  getSubRows: TreeAccessor<TData>['getSubRows']
  /** 与表格一致的行 id 访问器。 */
  getRowId: TreeAccessor<TData>['getRowId']
  /** 受控展开态（页面自己管理展开时传；不传则由本 hook 维护内部状态）。 */
  controlledExpanded?: ExpandedState
  onControlledExpandedChange?: (next: ExpandedState) => void
}

/**
 * 展开态优先级：受控 prop → 搜索态（自动展开 + 用户在该态下的手动调整）→ 内部默认折叠。
 *
 * 用法：
 *
 * ```tsx
 * const treeSearch = useTreeSearchExpanded<Row>({ filteredNodes, keyword, getSubRows, getRowId })
 * const table = useTable({
 *   features: treeTableFeatures,
 *   data: pagedNodes,
 *   columns,
 *   state: { expanded: treeSearch.expanded },
 *   onExpandedChange: treeSearch.onExpandedChange,
 *   getRowId,
 *   getSubRows,
 * })
 * ```
 */
export function useTreeSearchExpanded<TData>({
  filteredNodes,
  keyword,
  getSubRows,
  getRowId,
  controlledExpanded,
  onControlledExpandedChange,
}: UseTreeSearchExpandedOptions<TData>): {
  expanded: ExpandedState
  onExpandedChange: (next: ExpandedState | ((old: ExpandedState) => ExpandedState)) => void
} {
  const [innerExpanded, setInnerExpanded] = useState<ExpandedState>({})
  const setExpandedState: (next: ExpandedState) => void =
    onControlledExpandedChange ?? setInnerExpanded

  /** 内部展开态收窄成 id 映射（`ExpandedState` 允许 `true` 这个特例值）。 */
  const innerExpandedMap = useMemo<TreeExpandedMap>(
    () => (typeof innerExpanded === 'object' && innerExpanded !== null ? innerExpanded : {}),
    [innerExpanded],
  )

  const searchExpanded = useMemo(
    () => buildTreeSearchExpanded(filteredNodes, { getSubRows, getRowId }),
    [filteredNodes, getRowId, getSubRows],
  )

  const expanded = useMemo<ExpandedState>(() => {
    if (controlledExpanded !== undefined) return controlledExpanded
    if (!keyword.trim()) return innerExpanded
    // 用户的显式调整（含折叠 false）优先于搜索态的自动展开
    return { ...searchExpanded, ...innerExpandedMap }
  }, [controlledExpanded, innerExpanded, innerExpandedMap, keyword, searchExpanded])

  /**
   * 关键词清空 → 回到默认折叠：搜索期间的手动调整不跨搜索保留，
   * 否则会留下一棵被上次搜索撑开的树。取值幂等（状态未变不会多渲染）。
   */
  useEffect(() => {
    if (keyword.trim()) return
    setExpandedState({})
  }, [keyword, setExpandedState])

  const onExpandedChange = useMemo(
    () => (next: ExpandedState | ((old: ExpandedState) => ExpandedState)) =>
      setExpandedState(typeof next === 'function' ? next(expanded) : next),
    [expanded, setExpandedState],
  )

  return { expanded, onExpandedChange }
}
