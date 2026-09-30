import { createFileRoute } from '@tanstack/react-router'
import { UserEditPage } from '#/features/users/user/edit'

/** 编辑用户路由（`/$appId/users/user/$id/edit`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/users/user/$id/edit')({
  component: UserEditRoute,
})

function UserEditRoute() {
  const { appId, id } = Route.useParams()
  return <UserEditPage appId={appId} id={id} />
}
