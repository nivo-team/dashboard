import { createFileRoute } from '@tanstack/react-router'
import { SphereNewSessionPage } from '#/features/sphere/sphere-new-session'

/**
 * 「新会话」路由（`/$appId/sphere`）—— **薄适配层**。
 * 页面本体（挂载即 `startNewSession()`）在 `#/features/sphere/sphere-new-session`。
 */
export const Route = createFileRoute('/$appId_/sphere/')({
  component: SphereNewSessionPage,
})
