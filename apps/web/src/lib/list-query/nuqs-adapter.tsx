import { useLocation, useRouter, useRouterState } from '@tanstack/react-router'
import {
  renderQueryString,
  unstable_createAdapterProvider as createAdapterProvider,
} from 'nuqs/adapters/custom'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

/**
 * 本地实现的 TanStack Router 适配器。
 *
 * 为什么直接在项目内维护：
 * 1. 避免 Vite 预构建 nuqs/adapters/tanstack-router 时复制一份独立的 routerContext 造成
 *    `Cannot read properties of null (reading 'history')`；
 * 2. 对 `router?.history` 做安全防御判断，防止任何渲染中间态抛错；
 * 3. 严格共享同一个 `@tanstack/react-router` 实例。
 */
function useNuqsTanstackRouterAdapter(watchKeys: string[]) {
  const pathname = useLocation({ select: (state) => state.pathname })
  const search = useRouterState({
    select: (state) =>
      Object.fromEntries(
        Object.entries(state.location.search).filter(([key]) =>
          watchKeys.includes(key),
        ),
      ),
    structuralSharing: true,
  })
  const resolvedPathname = useRouterState({
    select: (state) =>
      state.resolvedLocation?.pathname ?? state.location.pathname,
  })
  const router = useRouter({ warn: false })
  const navigate = router?.navigate

  const ownedPathnameRef = useRef(pathname)
  const cachedSearchRef = useRef(search)
  const isPathStable = pathname === resolvedPathname
  if (isPathStable) {
    ownedPathnameRef.current = pathname
    cachedSearchRef.current = search
  }
  const activeSearch =
    !isPathStable && ownedPathnameRef.current !== pathname
      ? cachedSearchRef.current
      : search

  return {
    searchParams: useMemo(
      () =>
        new URLSearchParams(
          Object.entries(activeSearch).flatMap(([key, value]) => {
            if (Array.isArray(value)) return value.map((v) => [key, String(v)])
            if (typeof value === 'object' && value !== null)
              return [[key, JSON.stringify(value)]]
            return [[key, String(value)]]
          }),
        ),
      [activeSearch, watchKeys.join(',')],
    ),
    updateUrl: useCallback(
      (
        searchParams: URLSearchParams,
        options: { history?: 'replace' | 'push'; scroll?: boolean },
      ) => {
        if (!navigate) return
        startTransition(() => {
          navigate({
            from: '/',
            to: pathname + renderQueryString(searchParams),
            replace: options.history === 'replace',
            resetScroll: options.scroll,
            hash: (prevHash) => prevHash ?? '',
            state: (state) => state,
          })
        })
      },
      [navigate, pathname],
    ),
    rateLimitFactor: 1,
  }
}

const Provider = createAdapterProvider(useNuqsTanstackRouterAdapter)

function HistorySpy() {
  const router = useRouter({ warn: false })
  useEffect(() => {
    if (!router?.history) return
    return router.history.subscribe(() => {})
  }, [router?.history])
  return null
}

export function NuqsAdapter({ children }: { children: ReactNode }) {
  return (
    <Provider>
      <HistorySpy />
      {children}
    </Provider>
  )
}
