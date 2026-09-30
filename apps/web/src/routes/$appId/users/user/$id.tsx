import { createFileRoute } from '@tanstack/react-router'
import { UserDetailPage } from '#/features/users/user/detail'

/**
 * 用户详情路由（`/$appId/users/user/$id`）—— **薄适配层**。
 *
 * 路由文件只做三件事：声明路径、取 URL 参数、把参数交给 `src/features` 里的页面组件。
 * 业务代码（含 AI 的特性声明）一律在 `src/features/users/user/detail/`，
 * 见 `.agents/docs/features-architecture.md`。
 */
export const Route = createFileRoute('/$appId/users/user/$id')({
  component: UserDetailRoute,
})

function UserDetailRoute() {
  const { appId, id } = Route.useParams()
  return <UserDetailPage appId={appId} id={id} />
}
