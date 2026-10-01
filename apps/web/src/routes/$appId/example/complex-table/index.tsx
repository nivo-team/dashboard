import { createFileRoute } from '@tanstack/react-router'
import { ComplexTablePage } from '#/features/complex-table'

/**
 * 复杂表格示例路由（`/$appId/example/complex-table`）—— **薄适配层**。
 *
 * 页面本体与 AI 特性声明在 `src/features/complex-table/`。
 */
export const Route = createFileRoute('/$appId/example/complex-table/')({
  component: ComplexTablePage,
})
