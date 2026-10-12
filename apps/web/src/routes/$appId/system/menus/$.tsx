import { createFileRoute, redirect } from '@tanstack/react-router'
import { MenusPage } from '#/features/menus'
import { MENU_ROOT_ID } from '#/features/menus/feature-options'
import { guardRoutePermission } from '#/lib/app-route-guard'

export const Route = createFileRoute('/$appId/system/menus/$')({
  beforeLoad: async ({ params, location }) => {
    const splat = params._splat?.replace(/^\/+|\/+$/g, '')
    if (splat === 'new') {
      await guardRoutePermission({
        appId: params.appId,
        permission: 'feature:create',
        href: location.href,
      })
      return
    }

    if (splat && Number(splat) === MENU_ROOT_ID) {
      throw redirect({
        to: '/$appId/system/menus',
        params: { appId: params.appId },
      })
    }

    await guardRoutePermission({
      appId: params.appId,
      permission: 'feature:read',
      href: location.href,
    })
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { pid?: number; type?: 'group' | 'button' } => {
    const rawPid = Number(search.pid)
    return {
      pid: Number.isFinite(rawPid) && rawPid > 0 ? rawPid : undefined,
      type: search.type === 'group' ? 'group' : search.type === 'button' ? 'button' : undefined,
    }
  },
  component: MenusSplatRoute,
})

function MenusSplatRoute() {
  const { _splat } = Route.useParams()
  return <MenusPage splat={_splat} />
}
