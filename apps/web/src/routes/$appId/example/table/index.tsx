import { createFileRoute } from '@tanstack/react-router'
import { TableExampleListPage } from '#/features/example/table'
import { guardRoutePermission } from '#/lib/app-route-guard'

/**
 * 表格示例列表路由（`/$appId/example/table`）。
 * 权限拦截收口在当前页面自身，不污染整个 example 模块。
 */
export const Route = createFileRoute('/$appId/example/table/')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'example:read',
      href: location.href,
    })
  },
  component: TableExampleListPage,
})
