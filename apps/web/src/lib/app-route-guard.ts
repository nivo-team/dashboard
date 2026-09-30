import { notFound, redirect } from '@tanstack/react-router'
import {
  DEFAULT_APP_ID,
  getAuthSnapshot,
  getDefaultApp,
  isMultiAppEnabled,
  selectAppAndComplete,
  setAvailableApps,
} from '#/lib/auth'

/**
 * `/$appId/**` 系列路由共用的 `beforeLoad` 守卫。
 *
 * 抽成函数而不是每个布局各写一遍，原因是**应用作用域校验只有一个真值**：
 * 目前有两处挂载点，将来还会有更多 ——
 * - `routes/$appId/route.tsx`：正常的业务外壳（`AppShell`）；
 * - `routes/$appId_.sphere/route.tsx`：全屏 AI 对话页（**刻意逃离业务外壳**，见
 *   `.agents/docs/routing-architecture.md` §1 的「逃离父布局」一节）。
 *
 * 后者不是 `$appId` 布局的子路由（否则会一并继承 `AppShell` 的侧边栏与顶栏），
 * 因此它拿不到父级的 `beforeLoad`；两处若各写一份，将来加一条规则（比如按权限
 * 收窄可用应用）就必然漏掉一处。
 *
 * 三件事，顺序不能换：
 * 1. 未认证 → 跳登录页并带上回跳地址；
 * 2. URL 里的 appId 不在可用应用列表里 → `notFound()`，由外层外壳呈现 404；
 * 3. 有效但与当前激活应用不一致（直接粘贴链接进来）→ 同步为该应用，
 *    app 作用域 / API Base URL 才会跟着切。
 *
 * `href` 由调用方传 `location.href`：这个函数不是组件，拿不到路由上下文。
 */
export function guardAppRoute({ appId, href }: { appId: string; href: string }): void {
  const auth = getAuthSnapshot()

  if (!auth.isAuthenticated) {
    throw redirect({
      to: '/login',
      search: { redirect: href },
    })
  }

  let matchedApp = auth.availableApps.find((app) => app.id === appId)

  // 单应用模式兜底：若匹配默认应用且本地列表尚未水合，自动补充默认单应用
  if (!matchedApp && !isMultiAppEnabled() && appId === DEFAULT_APP_ID) {
    const defaultApp = getDefaultApp()
    setAvailableApps([defaultApp])
    matchedApp = defaultApp
  }

  if (!matchedApp) {
    throw notFound()
  }

  if (!auth.currentApp || auth.currentApp.id !== appId) {
    selectAppAndComplete(matchedApp.id)
  }
}
