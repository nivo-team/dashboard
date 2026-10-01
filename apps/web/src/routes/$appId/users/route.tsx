import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 用户运营模块根路由（/$appId/users）。
 *
 * 目录化约定：每个业务模块以目录承载，模块根 `route.tsx` 是该模块的边界，
 * 子模块（如 user 用户列表）继续以子目录组织，使路由层级与侧边栏
 * 「用户运营 → 用户列表」保持一致，便于后续在这里挂载更多子模块。
 */
export const Route = createFileRoute('/$appId/users')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'user:read',
      href: location.href,
    })
  },
  component: UsersModuleLayout,
})

function UsersModuleLayout() {
  return <Outlet />
}
