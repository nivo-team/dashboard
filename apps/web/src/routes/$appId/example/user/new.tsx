import { createFileRoute } from '@tanstack/react-router'
import { TableExampleCreatePage } from '#/features/table-example/create-page'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 新建记录路由（`/$appId/example/user/new`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/example/user/new')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'table-example:create',
      href: location.href,
    })
  },
  component: TableExampleCreateRoute,
})

function TableExampleCreateRoute() {
  const { appId } = Route.useParams()
  return <TableExampleCreatePage appId={appId} />
}
