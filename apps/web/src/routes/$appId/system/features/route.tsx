import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 功能（Features）子模块根路由（/$appId/system/features）。
 *
 * 目录化约定：模块以目录承载，模块根 `route.tsx` 是模块边界，子模块继续用子目录组织。
 * 本模块对外只有三个落点（详见 `index.tsx` / `$featureId.tsx` / `new.tsx`）：
 * 容器视图、按类型分流的节点视图、创建表单。
 */
export const Route = createFileRoute('/$appId/system/features')({
  component: SystemFeaturesModuleLayout,
})

function SystemFeaturesModuleLayout() {
  return <Outlet />
}
