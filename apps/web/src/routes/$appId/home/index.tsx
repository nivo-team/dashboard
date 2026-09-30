import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '#/features/home'

/**
 * 仪表盘路由（`/$appId/home`）—— **薄适配层**。
 *
 * 页面本体、卡片注册表与 AI 特性声明（卡片数据源 + 编排指令）都在
 * `src/features/home/`：这一层只负责"路径 → 组件"。
 * 约定见 `.agents/docs/features-architecture.md`。
 */
export const Route = createFileRoute('/$appId/home/')({
  component: HomePage,
})
