import { QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { getQueryClient } from '#/lib/query-client'
import {
  GLOBAL_APP_SCOPE,
  getAppScope,
  subscribeAppScope,
} from '#/lib/store/app-scope'

/**
 * 按当前应用作用域提供 QueryClient。
 *
 * 查询缓存按应用分区（见 `#/lib/query-client`），所以 Provider 的 client 必须跟着
 * app 作用域走：切换应用时换成那一份 client，组件树重新订阅到对应缓存；
 * 切回来时该应用的缓存仍在（`gcTime` 内），无需重新请求。
 *
 * 挂在 `RouterProvider` 外层：路由切换不重建缓存实例，同一应用内全站共享一份。
 */
export function AppQueryClientProvider({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(
    subscribeAppScope,
    getAppScope,
    () => GLOBAL_APP_SCOPE,
  )

  const client = useMemo(() => getQueryClient(scope), [scope])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
