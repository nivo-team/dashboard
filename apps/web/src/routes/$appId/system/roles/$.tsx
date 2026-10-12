import { createFileRoute, notFound } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { RoleListPage } from '#/features/roles'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/system/roles/$')({
  beforeLoad: async ({ params, location }) => {
    const match = matchCrudSplat(params._splat, { enableDetail: true })
    if (!match) {
      throw notFound()
    }

    const permission = match.type === 'create' ? 'role:create' : undefined

    await guardRoutePermission({
      appId: params.appId,
      permission,
      href: location.href,
    })
  },
  component: RolesSplatRoute,
})

function RolesSplatRoute() {
  const { _splat } = Route.useParams()
  return <RoleListPage splat={_splat} />
}
