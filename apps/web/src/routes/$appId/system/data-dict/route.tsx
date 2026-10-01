import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 数据字典子模块根路由（/$appId/system/data-dict）。
 *
 * 目录化约定：模块以目录承载，模块根 `route.tsx` 是模块边界，子模块继续用子目录组织。
 * 本模块统一校验 dict:read 权限。
 */
export const Route = createFileRoute('/$appId/system/data-dict')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'dict:read',
      href: location.href,
    })
  },
  component: SystemDataDictModuleLayout,
})

function SystemDataDictModuleLayout() {
  return <Outlet />
}
