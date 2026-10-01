import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 系统管理模块根路由（/$appId/system）。
 *
 * 目录化约定：系统模块以目录承载，模块根 `route.tsx` 是模块边界，
 * 统一在此挂载系统域的权限守卫（要求具备菜单 / 字典 / 角色的读取权限之一），
 * 子模块继续用子目录组织：`system/menus`（菜单管理）、`system/data-dict`（数据字典）、
 * `system/roles`（角色管理）。
 *
 * 这里的 `any` 口径必须与侧边栏「系统」组的 `groupPermissionMode: 'any'` 一致 ——
 * 否则会出现「能直接进页面、侧边栏却看不到入口」。
 */
export const Route = createFileRoute('/$appId/system')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: { any: ['feature:read', 'dict:read', 'role:read'] },
      href: location.href,
    })
  },
  component: SystemModuleLayout,
})

function SystemModuleLayout() {
  return <Outlet />
}
