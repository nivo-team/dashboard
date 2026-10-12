import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { matchCrudSplat } from '#/components/crud'
import { TableExampleListPage } from '#/features/example/table'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/example/table/$')({
  beforeLoad: async ({ params, location }) => {
    const searchParams = new URLSearchParams(location.search)
    const type = searchParams.get('type')
    const match = matchCrudSplat(params._splat, { enableDetail: true, type })
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

    // 存量路径规范化重定向至纯 Query 模式
    const base = `/${params.appId}/example/table`
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
    if (match.type === 'detail') {
      throw redirect({
        href: `${base}?id=${encodeURIComponent(match.id)}&type=detail&view=page`,
      })
    }
  },
  component: TableExampleSplatRoute,
})

function TableExampleSplatRoute() {
  const { _splat } = Route.useParams()
  return <TableExampleListPage splat={_splat} />
}
