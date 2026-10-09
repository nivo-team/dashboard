import { createFileRoute } from '@tanstack/react-router'
import { TicketsListPage } from '#/features/example/tickets'

/**
 * 工单管理路由（`/$appId/example/tickets`）—— **薄适配层**。
 *
 * 页面本体与 AI 特性声明全在 `src/features/example/tickets/`：这一层只负责"路径 → 组件"。
 * 这一页是「后端没有批量接口」的样板，用来验收 AI 的任务编排能力。
 */
export const Route = createFileRoute('/$appId/example/tickets/')({
  component: TicketsListPage,
})
