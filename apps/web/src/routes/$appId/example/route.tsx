import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 示例模块根路由（`/$appId/example`）。
 * 纯布局容器，仅渲染 `<Outlet />`，不承载模块级权限拦截。
 * 通用路由拦截精确收口至 `example/table`，避免误拦截其它独立示例页面。
 */
export const Route = createFileRoute('/$appId/example')({
  component: ExampleModuleLayout,
})

function ExampleModuleLayout() {
  return <Outlet />
}
