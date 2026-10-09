import { createFileRoute } from '@tanstack/react-router'
import { TicketCreatePage } from '#/features/example/tickets/form-page'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 新建工单独立页（`/$appId/example/tickets/new`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/example/tickets/new')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'example:create',
      href: location.href,
    })
  },
  component: TicketCreateRoute,
})

function TicketCreateRoute() {
  const { appId } = Route.useParams()
  return <TicketCreatePage appId={appId} />
}
