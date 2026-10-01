import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 功能（Features）子模块根路由（/$appId/system/menus）。
 *
 * 目录化约定：模块以目录承载，模块根 `route.tsx` 是模块边界，子模块继续用子目录组织。
 * 本模块统一校验 feature:read 权限。
 */
export const Route = createFileRoute('/$appId/system/menus')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'feature:read',
      href: location.href,
    })
  },
  component: SystemFeaturesModuleLayout,
})

function SystemFeaturesModuleLayout() {
  return <Outlet />
}
