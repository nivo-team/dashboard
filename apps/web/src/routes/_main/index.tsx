import { createFileRoute, redirect } from '@tanstack/react-router'
import { SelectAppPage } from '#/features/select-app'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'
import { shouldEnterAppSelect } from '#/lib/app-config'

interface SelectAppSearch {
  redirect?: string
}

/**
 * 根路径"应用选择 + 管理"路由（`/_main/index.tsx` -> "/"）—— **薄适配层**。
 *
 * `validateSearch` / `beforeLoad` 是路由语义，留在这一层；
 * 页面本体在 `#/features/select-app`（点行进应用、写按钮按权限收敛），`redirect` 通过 props 传入。
 */
export const Route = createFileRoute('/_main/')({
  validateSearch: (search: Record<string, unknown>): SelectAppSearch => {
    return {
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    }
  },
  beforeLoad: ({ search }) => {
    const safeRedirect =
      search.redirect &&
      search.redirect.startsWith('/') &&
      search.redirect !== '/' &&
      search.redirect !== '/select-app'
        ? search.redirect
        : undefined

    // 单应用模式：`/` 只是入口别名，直接送去默认应用业务首页
    if (!isMultiAppEnabled()) {
      throw redirect({ to: (safeRedirect ?? `/${DEFAULT_APP_ID}/home`) as any })
    }

    /*
      多应用模式：按「进入应用选择的策略 + 该账号实际可用的应用数」决定要不要停留在这里。
      - 列表来自持久化的认证 store（上次登录后写入的 `availableApps`），所以刷新页面也能判；
      - 列表为空（首次登录、还没拉到）时**留在本页**，由页面自己拉取后展示 ——
        此时无从判断应用数，留在选择页是最安全的默认。
    */
    const { availableApps } = getAuthSnapshot()
    if (availableApps.length > 0 && !shouldEnterAppSelect(availableApps.length)) {
      throw redirect({ to: (safeRedirect ?? `/${availableApps[0].id}/home`) as any })
    }
  },
  component: SelectAppRoute,
})

/** 只做取参：应用选择逻辑在 `#/features/select-app`。 */
function SelectAppRoute() {
  const { redirect: redirectUrl } = Route.useSearch()
  return <SelectAppPage redirect={redirectUrl} />
}
