import { createFileRoute } from '@tanstack/react-router'
import { NewFeaturePage } from '#/features/system/features/create'

/**
 * 新建功能 / 功能组 / 权限点路由（`/$appId/system/features/new?pid=<父id>[&type=group|button]`）。
 *
 * `validateSearch` 留在这里（路由语义）：把 URL 上的 `pid` / `type` 收敛成合法值，
 * 缺省 / 非法时回落到根节点与「功能」。页面通过 props 收这两个参数。
 */
export const Route = createFileRoute('/$appId/system/features/new')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { pid?: number; type?: 'group' | 'button' } => {
    const rawPid = Number(search.pid)
    return {
      pid: Number.isFinite(rawPid) && rawPid > 0 ? rawPid : undefined,
      type:
        search.type === 'group' ? 'group' : search.type === 'button' ? 'button' : undefined,
    }
  },
  component: NewFeatureRoute,
})

function NewFeatureRoute() {
  const { pid, type } = Route.useSearch()
  return <NewFeaturePage pid={pid} type={type} />
}
