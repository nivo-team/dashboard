import { createFileRoute } from '@tanstack/react-router'
import { UserCreatePage } from '#/features/users/user/create'

/** 新建用户路由（`/$appId/users/user/new`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/users/user/new')({
  component: UserCreateRoute,
})

function UserCreateRoute() {
  const { appId } = Route.useParams()
  return <UserCreatePage appId={appId} />
}
