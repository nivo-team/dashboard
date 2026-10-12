import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { RoleListPage } from '#/features/roles'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/system/roles/$')({
  beforeLoad: async ({ params, location }) => {
    const searchParams = new URLSearchParams(location.search)
    const type = searchParams.get('type')
    const match = matchCrudSplat(params._splat, { enableDetail: true, type })
    if (!match) {
      throw notFound()
    }

    const permission = match.type === 'create' ? 'role:create' : undefined

    await guardRoutePermission({
      appId: params.appId,
      permission,
      href: location.href,
    })

    const base = `/${params.appId}/system/roles`
    if (match.type === 'create') {
      throw redirect({
        href: `${base}?type=edit&view=page`,
      })
    }
    if (match.type === 'detail') {
      throw redirect({
        href: `${base}?id=${encodeURIComponent(match.id)}&type=detail&view=page`,
      })
    }
  },
  component: RolesSplatRoute,
})

function RolesSplatRoute() {
  const { _splat } = Route.useParams()
  return <RoleListPage splat={_splat} />
}
