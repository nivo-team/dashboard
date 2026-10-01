import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 角色管理子模块根路由（`/$appId/system/roles`）。
 *
 * 模块边界统一校验 `role:read`；子路由（详情）不重复声明读权限，
 * 写权限由按钮级 `useHasPermission('role:edit')` 与后端校验收口。
 */
export const Route = createFileRoute('/$appId/system/roles')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'role:read',
      href: location.href,
    })
  },
  component: RolesModuleLayout,
})

function RolesModuleLayout() {
  return <Outlet />
}
