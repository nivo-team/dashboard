import { createFileRoute } from '@tanstack/react-router'
import { TableExampleEditPage } from '#/features/table-example/edit-page'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 编辑记录路由（`/$appId/example/user/$id/edit`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/example/user/$id/edit')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'table-example:edit',
      href: location.href,
    })
  },
  component: TableExampleEditRoute,
})

function TableExampleEditRoute() {
  const { appId, id } = Route.useParams()
  return <TableExampleEditPage appId={appId} id={id} />
}
