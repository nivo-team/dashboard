export * from './data-table'
export * from './features'
export * from './schema-columns'
export * from './tree-search'
// 树搜索的纯函数放在 lib（数据层也要用）；这里再导出一次，UI 侧一处导入即可
export { buildTreeSearchExpanded, filterTreeByMatch } from '#/lib/tree-search'
export type { TreeAccessor, TreeExpandedMap } from '#/lib/tree-search'
export {
  createColumnHelper,
  createExpandedRowModel,
  flexRender,
  stockFeatures,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'

export type {
  ColumnDef,
  ColumnVisibilityState,
  ExpandedState,
  Row,
  RowSelectionState,
  SortingState,
  StockFeatures,
  Table as TanStackTable,
} from '@tanstack/react-table'
