import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { NotFound } from '#/components/not-found'
import { RouteError, RoutePending } from '#/components/route-states'
import { routeTree } from './routeTree.gen'

/**
 * 全局 router 配置。
 *
 * 这里配置的默认状态组件会被挂载在**当前路由所在的位置**（父 layout 的 Outlet 处），
 * 而不是替换整页 —— 这正是「页面异步不卡顿」的关键：
 * 侧边栏与顶栏由 layout 持有，只有内容区随路由状态变化。
 */
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // 悬停即预加载，点击时通常已经就绪。
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // 150ms 内加载完就不显示加载态（避免闪烁）；一旦显示至少停留 300ms。
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
