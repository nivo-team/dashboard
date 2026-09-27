import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '#/lib/api-error'
import { getAppScope } from './store/app-scope'

/**
 * 查询缓存按应用分区。
 *
 * 每个应用一份独立的 `QueryClient`，键是 app 作用域（见 `#/lib/store/app-scope`）：
 * - **隔离**：不同应用的接口数据互不可见，不会因为 queryKey 相同而串数据；
 * - **保留**：切换应用不再清空对方的缓存，切回来在 `gcTime` 内即时可见
 *   （旧实现是「一切应用就 `clear()`」，等于把另一个应用的缓存也丢掉）；
 * - **兜底**：登录 / 登出 / 换账号这类身份边界，用 `clearAllQueryCaches()` 全清。
 *
 * 组件拿到的实例由 `AppQueryClientProvider` 按当前作用域提供，
 * 业务代码里的 `useQueryClient()` 仍是当前应用那一份，无需改动。
 */

/**
 * 创建带统一默认策略的查询客户端。
 *
 * 默认策略偏保守，避免管理后台频繁闪动：
 * - `staleTime: 30s` —— 30 秒内视为新鲜数据，不重复请求；
 * - `gcTime: 5min` —— 离开页面后缓存保留 5 分钟，返回时即时可见；
 * - `refetchOnWindowFocus: false` —— 后台标签页切回来不自动重取（列表页有手动刷新）；
 * - `retry` —— 网络 / HTTP 类失败重试一次；**业务错误（`code !== 0`，见 `ApiError`）不重试**，
 *   重试结果一样，只会重复弹提示。
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error)) return false
          return failureCount < 1
        },
      },
      mutations: {
        // 写操作不做自动重试，避免重复提交
        retry: false,
      },
    },
  })
}

/** 作用域 → QueryClient 的缓存池（惰性创建）。 */
const clients = new Map<string, QueryClient>()

/** 取某个应用作用域的 QueryClient，缺省是当前应用。 */
export function getQueryClient(scope: string = getAppScope()): QueryClient {
  let client = clients.get(scope)
  if (!client) {
    client = createQueryClient()
    clients.set(scope, client)
  }
  return client
}

/** 清空某个应用作用域的缓存（缺省当前应用）。 */
export function clearQueryCache(scope: string = getAppScope()): void {
  clients.get(scope)?.clear()
}

/**
 * 清空**所有**应用的查询缓存。
 *
 * 调用时机是「身份或数据域整体失效」的边界：登录、退出登录、切换账号。
 * 应用之间的切换**不再**走这里 —— 那是数据域隔离，由分区本身保证。
 */
export function clearAllQueryCaches(): void {
  clients.forEach((client) => client.clear())
}
