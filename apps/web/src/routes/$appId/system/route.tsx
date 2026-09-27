import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 系统管理模块根路由（/$appId/system）。
 *
 * 目录化约定：系统模块以目录承载，模块根 `route.tsx` 是模块边界
 * （后续可在此挂载系统域的统一权限守卫），子模块继续用子目录组织：
 * `system/features`（功能）→「系统 → 功能」。
 */
export const Route = createFileRoute('/$appId/system')({
  component: SystemModuleLayout,
})

function SystemModuleLayout() {
  return <Outlet />
}
