import { createFileRoute, notFound } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { TableExampleListPage } from '#/features/example/table'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/example/table/$')({
  beforeLoad: async ({ params, location }) => {
    const match = matchCrudSplat(params._splat, { enableDetail: true })
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
  component: TableExampleSplatRoute,
})

function TableExampleSplatRoute() {
  const { _splat } = Route.useParams()
  return <TableExampleListPage splat={_splat} />
}
