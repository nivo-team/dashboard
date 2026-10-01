import { createFileRoute } from '@tanstack/react-router'
import { RoleDetailPage } from '#/features/system/roles/detail'

/**
 * 角色详情路由（`/$appId/system/roles/$roleId`）—— **薄适配层**。
 * 页面本体与 AI 特性声明在 `src/features/system/roles/detail/`。
 */
export const Route = createFileRoute('/$appId/system/roles/$roleId')({
  component: RoleDetailPage,
})
