import { Outlet, createFileRoute } from '@tanstack/react-router'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 示例模块根路由（`/$appId/example`）。
 *
 * 模块边界：统一在此校验「示例」模块的读取权限，子页面沿用或各自细粒度收口
 * （表格示例用 `table-example:read`，新建 / 编辑再按动作细分）。这里只渲染
 * `<Outlet />`，不承载任何页面逻辑 —— 见 `.agents/docs/features-architecture.md`。
 */
export const Route = createFileRoute('/$appId/example')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'table-example:read',
      href: location.href,
    })
  },
  component: ExampleModuleLayout,
})

function ExampleModuleLayout() {
  return <Outlet />
}
