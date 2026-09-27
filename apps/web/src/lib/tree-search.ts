/**
 * 树形数据的**搜索过滤**纯函数（无 React 依赖，数据层与 UI 层都能用）。
 *
 * 与它配套的展开态 hook 在 `#/components/data-table` 的 `useTreeSearchExpanded`，
 * UI 侧通常从那里一起导入。
 */

/** 展开态的行 id 映射。 */
export type TreeExpandedMap = Record<string, boolean>

/**
 * 与表格保持一致的节点访问器。
 *
 * `getSubRows` / `getRowId` 会作为 `useMemo` 依赖使用，建议定义成**模块级常量**
 * （或 `useCallback`），避免每次渲染都重建、让派生结果反复失效。
 */
export type TreeAccessor<TData> = {
  /** 取子节点 —— 必须与传给 `useTable` 的 `getSubRows` 一致。 */
  getSubRows: (row: TData) => TData[] | undefined
  /** 取行 id —— 必须与传给 `useTable` 的 `getRowId` 一致（展开态按它索引）。 */
  getRowId: (row: TData) => string
  /** 用「过滤后的子节点」构造新行（各模块的行结构不同，所以由调用方给）。 */
  withChildren: (row: TData, children: TData[]) => TData
}

/**
 * 过滤树：**只保留命中节点 + 其祖先链**。
 *
 * - 命中节点只带**命中的后代**（未匹配的下级不出现在结果里）；
 * - 祖先因 `children` 非空被保留，用于把深层命中撑出层级。
 *
 * 想让命中节点连带整棵子树时，把 `withChildren` 改成回传完整子节点即可
 * （产品决策，改前先确认）。
 */
export function filterTreeByMatch<TData>(
  nodes: TData[],
  matches: (row: TData) => boolean,
  accessor: Pick<TreeAccessor<TData>, 'getSubRows' | 'withChildren'>,
): TData[] {
  const walk = (list: TData[]): TData[] => {
    const result: TData[] = []
    for (const row of list) {
      const children = walk(accessor.getSubRows(row) ?? [])
      if (matches(row) || children.length > 0) {
        result.push(accessor.withChildren(row, children))
      }
    }
    return result
  }
  return walk(nodes)
}

/** 搜索态的展开映射：把过滤结果里的**每个分支节点**按行 id 置 true。 */
export function buildTreeSearchExpanded<TData>(
  nodes: TData[],
  accessor: Pick<TreeAccessor<TData>, 'getSubRows' | 'getRowId'>,
): TreeExpandedMap {
  const map: TreeExpandedMap = {}

  const walk = (list: TData[]) => {
    for (const row of list) {
      const children = accessor.getSubRows(row) ?? []
      if (children.length > 0) map[accessor.getRowId(row)] = true
      walk(children)
    }
  }
  walk(nodes)

  return map
}

/**
 * 统计树里的**节点总数（含所有层级）** —— 树表「共 N 项」的统一口径。
 *
 * 为什么不是顶层项数：树表默认折叠，但用户一展开就会看到更多行，
 * 「共 N 项」如果只数顶层，展开后行数与统计值对不上（分页 total 才该用顶层项数）。
 * 传过滤后的结果树进来，统计就会跟着搜索一起变。
 */
export function countTreeNodes<TData>(
  nodes: TData[],
  getSubRows: (row: TData) => TData[] | undefined,
): number {
  let total = 0

  const walk = (list: TData[]) => {
    for (const row of list) {
      total += 1
      walk(getSubRows(row) ?? [])
    }
  }
  walk(nodes)

  return total
}
