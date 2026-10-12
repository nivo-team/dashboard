import { createFileRoute } from '@tanstack/react-router'
import { MenusPage } from '#/features/menus'

/**
 * 菜单管理根路由（`/$appId/system/menus`）—— **薄适配层**。
 * 业务实现与节点调度在 `src/features/menus/`。
 */
export const Route = createFileRoute('/$appId/system/menus/')({
  component: MenusPage,
})
