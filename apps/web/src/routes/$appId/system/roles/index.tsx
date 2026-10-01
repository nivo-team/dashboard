import { createFileRoute } from '@tanstack/react-router'
import { RoleListPage } from '#/features/roles/list'

/**
 * 角色列表路由（`/$appId/system/roles`）—— **薄适配层**。
 * 页面本体与 AI 特性声明在 `src/features/roles/list/`。
 */
export const Route = createFileRoute('/$appId/system/roles/')({
  component: RoleListPage,
})
