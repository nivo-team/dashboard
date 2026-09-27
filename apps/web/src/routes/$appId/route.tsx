import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { MainNotFound } from '#/components/main-layout'
import { RouteError } from '#/components/route-states'
import { getAuthSnapshot, selectAppAndComplete } from '#/lib/auth'

/**
 * [appId] 业务外壳布局路由（/$appId/route.tsx）。
 *
 * 所有特定 App 的业务控制台路由都在此布局下运行：
 * - appId 作为给后端区分具体 App 的唯一标识；
 * - beforeLoad 鉴权拦截与 App 同步：若未认证则跳转 /login；若 URL 中指定的 appId 不在当前账号可用的应用列表里则抛出 404 并回退在 _main 通用外壳中呈现；有效且与当前激活 App 不一致时自动同步为该 App；
 * - 子页面切换时不重新挂载 AppShell。
 *
 * 可用应用列表来自 `GET /apps`（登录后写入认证状态），因此这里只认这一份，
 * 不再有「静态应用池」之类的第二真值。
 */
export const Route = createFileRoute('/$appId')({
  beforeLoad: ({ location, params }) => {
    const auth = getAuthSnapshot()
    // 1. 未认证重定向到登录页
    if (!auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
    // 2. 校验并同步 URL 中的 appId
    const targetAppId = params.appId
    const matchedApp = auth.availableApps.find((a) => a.id === targetAppId)

    if (!matchedApp) {
      throw notFound()
    }

    // 若当前生效的应用与 URL 不一致（例如直接粘贴链接进入），同步为 URL 指定的应用
    if (!auth.currentApp || auth.currentApp.id !== targetAppId) {
      selectAppAndComplete(matchedApp.id)
    }
  },
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: MainNotFound,
})
