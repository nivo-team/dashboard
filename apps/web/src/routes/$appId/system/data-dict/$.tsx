import { createFileRoute, redirect } from '@tanstack/react-router'
import { DataDictPage } from '#/features/data-dict'
import { DICT_ROOT_TYPE_ID } from '#/features/data-dict/data-dict-options'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/system/data-dict/$')({
  beforeLoad: async ({ params, location }) => {
    const splat = params._splat?.replace(/^\/+|\/+$/g, '')
    if (splat && Number(splat) === DICT_ROOT_TYPE_ID) {
      throw redirect({
        to: '/$appId/system/data-dict',
        params: { appId: params.appId },
      })
    }

    await guardRoutePermission({
      appId: params.appId,
      permission: 'dict:read',
      href: location.href,
    })
  },
  component: DataDictSplatRoute,
})

function DataDictSplatRoute() {
  const { _splat } = Route.useParams()
  return <DataDictPage splat={_splat} />
}
