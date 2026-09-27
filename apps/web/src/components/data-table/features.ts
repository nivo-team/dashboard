import {
  createExpandedRowModel,
  stockFeatures,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * 数据表格特性集（TanStack Table v9）。
 *
 * v9 中「特性模块」与「行模型工厂」都通过 `useTable` 的 `features` 槽注册，
 * 而不是像 v8 那样作为 table options 传入 —— 这也是树形表格必须使用
 * 下面的 `treeTableFeatures` 而不是 `stockFeatures` 的原因：
 * `stockFeatures` 只带 rowExpandingFeature（展开状态与 API），
 * 展开行模型工厂 `expandedRowModel` 需要显式注册后才会参与行模型管线。
 */

/**
 * 树形表格：内置特性全集 + 展开行模型工厂。
 *
 * 配套要求：
 * - `useTable` 传 `getSubRows`（如 `(row) => row.children`）；
 * - 受控 `state.expanded` / `onExpandedChange`；
 * - 行 id 用业务主键（`getRowId`），保证展开状态在数据刷新后稳定；
 * - `DataTable` 传 `tree`：层级缩进与展开控件固定落在**第一列**（不需要指定列 id）。
 */
export const treeTableFeatures = tableFeatures({
  ...stockFeatures,
  expandedRowModel: createExpandedRowModel(),
})
