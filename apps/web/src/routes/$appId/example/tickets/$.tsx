import { createFileRoute, notFound } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { TicketsListPage } from '#/features/example/tickets'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/example/tickets/$')({
  beforeLoad: async ({ params, location }) => {
    const match = matchCrudSplat(params._splat, { enableDetail: false })
    if (!match) {
      throw notFound()
    }

    const permission =
      match.type === 'create'
        ? 'example:create'
        : match.type === 'edit'
          ? 'example:edit'
          : undefined

    await guardRoutePermission({
      appId: params.appId,
      permission,
      href: location.href,
    })
  },
  component: TicketsSplatRoute,
})

function TicketsSplatRoute() {
  const { _splat } = Route.useParams()
  return <TicketsListPage splat={_splat} />
}
