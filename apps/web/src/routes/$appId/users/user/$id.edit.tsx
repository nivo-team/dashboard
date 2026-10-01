import { createFileRoute } from '@tanstack/react-router'
import { UserEditPage } from '#/features/users/user/edit'
import { guardRoutePermission } from '#/lib/app-route-guard'

/** 编辑用户路由（`/$appId/users/user/$id/edit`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/users/user/$id/edit')({
  beforeLoad: async ({ params, location }) => {
    await guardRoutePermission({
      appId: params.appId,
      permission: 'user:edit',
      href: location.href,
    })
  },
  component: UserEditRoute,
})

function UserEditRoute() {
  const { appId, id } = Route.useParams()
  return <UserEditPage appId={appId} id={id} />
}
