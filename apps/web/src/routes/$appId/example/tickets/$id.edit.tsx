import { createFileRoute } from '@tanstack/react-router'
import { TicketEditPage } from '#/features/example/tickets/form-page'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 编辑工单独立页（`/$appId/example/tickets/$id/edit`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/example/tickets/$id/edit')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'example:edit',
      href: location.href,
    })
  },
  component: TicketEditRoute,
})

function TicketEditRoute() {
  const { appId, id } = Route.useParams()
  return <TicketEditPage appId={appId} id={id} />
}
