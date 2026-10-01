import { notFound, redirect } from '@tanstack/react-router'
import {
  DEFAULT_APP_ID,
  getAuthSnapshot,
  getDefaultApp,
  isMultiAppEnabled,
  selectAppAndComplete,
  setAvailableApps,
} from '#/lib/auth'
import i18n from '#/lib/i18n'
import {
  ensureUserPermissions,
  hasPermission,
  type PermissionRequirement,
} from '#/lib/permissions'
import { getQueryClient } from '#/lib/query-client'
import { usePermissionStore } from '#/lib/store'
import { appToastManager } from '#/lib/toast'

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

export interface GuardRoutePermissionOptions {
  appId: string
  href: string
  /** 访问该路由所需的权限要求（单个权限、通配、数组或逻辑配置） */
  permission?: PermissionRequirement
  /** 无权限时的重定向目标，默认回落当前应用首页 `/${appId}/home` */
  fallbackTo?: string
  /** 是否弹窗提示无权限通知，默认 true */
  notify?: boolean
}

/**
 * 业务路由权限守卫（结合 App 鉴权与 RBAC 权限判定）。
 *
 * 流程：
 * 1. 优先调用 `guardAppRoute` 确保认证状态与激活应用一致；
 * 2. 若未声明 `permission` 则直接放行；
 * 3. 检查 store 中的权限清单，若当前处于未水合/未加载状态，自动通过 QueryClient 确保拉取；
 * 4. 判定是否有权限：
 *    - 有权限：放行；
 *    - 无权限：调用 `appToastManager` 提示「无权访问该页面」，并重定向至安全页面（默认 `/${appId}/home`）。
 */
export async function guardRoutePermission({
  appId,
  href,
  permission,
  fallbackTo,
  notify = true,
}: GuardRoutePermissionOptions): Promise<void> {
  // 1. 基础外壳守卫（认证 + appId 校验）
  guardAppRoute({ appId, href })

  // 2. 无额外权限要求
  if (!permission) return

  // 3. 读取当前 store 权限
  let permState = usePermissionStore.getState()
  // 冷启动直达路由（或刚登录/刚切号）时权限还没同步过，先拉一次
  if (permState.lastUpdated === null) {
    await ensureUserPermissions(getQueryClient())
    permState = usePermissionStore.getState()
  }

  const permitted = hasPermission(permission, {
    role: permState.role,
    permissions: permState.permissions,
    isSuperAdmin: permState.computed.isSuperAdmin,
    computed: permState.computed,
  })

  if (!permitted) {
    if (notify) {
      /*
        命名空间必须显式给：i18n 的 `defaultNS` 是 `common`（见 `#/lib/i18n`），
        写成 `t('auth.unauthorized')` 会被当成 common 下的嵌套键、命中不到，
        于是除中文外其余 6 种语言全部回落成硬编码中文（违反铁律 1）。
      */
      appToastManager.add({
        title: i18n.t('unauthorized', { ns: 'auth', defaultValue: '无权访问该页面' }),
        variant: 'warning',
      })
    }

    /*
      用 `href` 而不是 `to`：`to` 要的是**路由 id**（形如 `/$appId/home`），
      这里拼出来的是**具体路径**（`/nivo-admin/home`），传 `to` 会找不到路由。
      `href` 接受任意目标路径，`fallbackTo` 因此也能被调用方覆盖成非路由常量。
    */
    throw redirect({ href: fallbackTo ?? `/${appId}/home` })
  }
}
