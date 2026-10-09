import { createFileRoute } from '@tanstack/react-router'
import { TreeTableExamplePage } from '#/features/example/tree-table'

/**
 * 树形表格示例路由（`/$appId/example/tree-table`）—— **薄适配层**。
 *
 * 页面本体与 AI 特性声明在 `src/features/example/tree-table/`。
 */
export const Route = createFileRoute('/$appId/example/tree-table/')({
  component: TreeTableExamplePage,
})
