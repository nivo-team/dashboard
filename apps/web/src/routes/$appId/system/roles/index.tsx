import { createFileRoute } from '@tanstack/react-router'
import { RoleListPage } from '#/features/roles'

/**
 * 角色列表路由（`/$appId/system/roles`）—— **薄适配层**。
 * 页面本体与单文件视窗调度在 `src/features/roles/`。
 */
export const Route = createFileRoute('/$appId/system/roles/')({
  component: RoleListPage,
})
