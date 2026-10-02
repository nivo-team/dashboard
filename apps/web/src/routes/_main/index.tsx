import { createFileRoute, redirect } from '@tanstack/react-router'
import { SelectAppPage } from '#/features/select-app'
import { DEFAULT_APP_ID, isMultiAppEnabled } from '#/lib/auth'

interface SelectAppSearch {
  redirect?: string
}

/**
 * 根路径应用空间选择路由（`/_main/index.tsx` -> "/"）—— **薄适配层**。
 *
 * `validateSearch` / `beforeLoad` 是路由语义，留在这一层；
 * 页面本体在 `#/features/select-app`，`redirect` 通过 props 传入。
 */
export const Route = createFileRoute('/_main/')({
  validateSearch: (search: Record<string, unknown>): SelectAppSearch => {
    return {
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    }
  },
  beforeLoad: ({ search }) => {
    // 单应用模式下 / 路由作为可选，直接重定向至默认应用业务首页
    if (!isMultiAppEnabled()) {
      const target =
        search.redirect &&
        search.redirect.startsWith('/') &&
        search.redirect !== '/' &&
        search.redirect !== '/select-app'
          ? search.redirect
          : `/${DEFAULT_APP_ID}/home`
      throw redirect({ to: target as any })
    }
  },
  component: SelectAppRoute,
})

/** 只做取参：应用选择逻辑在 `#/features/select-app`。 */
function SelectAppRoute() {
  const { redirect: redirectUrl } = Route.useSearch()
  return <SelectAppPage redirect={redirectUrl} />
}
