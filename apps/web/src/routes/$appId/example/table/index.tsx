import { createFileRoute } from '@tanstack/react-router'
import { TableExampleListPage } from '#/features/example/table'

/**
 * 表格示例列表路由（`/$appId/example/table`）—— **薄适配层**。
 *
 * 页面本体、列编排与 AI 特性声明（可用指令 / 数据源 / 权限）全在
 * `src/features/example/table/`：这一层只负责“路径 → 组件”。
 */
export const Route = createFileRoute('/$appId/example/table/')({
  component: TableExampleListPage,
})
