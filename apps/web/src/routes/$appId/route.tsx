import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { MainNotFound } from '#/components/main-layout'
import { RouteError } from '#/components/route-states'
import { guardAppRoute } from '#/lib/app-route-guard'

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
 *
 * 守卫本体在 `#/lib/app-route-guard`：全屏 AI 对话页（`/$appId/sphere`）刻意逃离
 * 本布局，拿不到这里的 `beforeLoad`，两处共用同一个函数才不会漂移。
 */
export const Route = createFileRoute('/$appId')({
  beforeLoad: ({ location, params }) => {
    guardAppRoute({ appId: params.appId, href: location.href })
  },
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: MainNotFound,
})
