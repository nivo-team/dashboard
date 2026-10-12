import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { TicketsListPage } from '#/features/example/tickets'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/example/tickets/$')({
  beforeLoad: async ({ params, location }) => {
    const searchParams = new URLSearchParams(location.search)
    const type = searchParams.get('type')
    const match = matchCrudSplat(params._splat, { enableDetail: false, type })
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

    const base = `/${params.appId}/example/tickets`
    if (match.type === 'create') {
      throw redirect({
        href: `${base}?type=edit&view=page`,
      })
    }
    if (match.type === 'edit') {
      throw redirect({
        href: `${base}?id=${encodeURIComponent(match.id)}&type=edit&view=page`,
      })
    }
  },
  component: TicketsSplatRoute,
})

function TicketsSplatRoute() {
  const { _splat } = Route.useParams()
  return <TicketsListPage splat={_splat} />
}
