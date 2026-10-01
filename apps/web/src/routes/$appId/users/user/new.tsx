import { createFileRoute } from '@tanstack/react-router'
import { UserCreatePage } from '#/features/users/user/create'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 新建用户路由（`/$appId/users/user/new`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/users/user/new')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'user:create',
      href: location.href,
    })
  },
  component: UserCreateRoute,
})

function UserCreateRoute() {
  const { appId } = Route.useParams()
  return <UserCreatePage appId={appId} />
}
