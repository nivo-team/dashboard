import { configureAuthInterceptors, getApps, postLogin, updateClientBaseUrl } from '#/api'
import {
  DEFAULT_APP_ID,
  getDefaultApp,
  toAppItems,
  type AppItem,
  type AppPayload,
  type UserInfo,
} from './app-registry'
import { isMultiAppEnabled } from './app-config'
import { redirectToLogin, STORAGE_KEY, useAuthStore } from './store/auth-store'
import type { AuthStore } from './store/auth-store'
import { setAppScope } from './store/app-scope'
import { enableCrossTabSync } from './store/cross-tab-sync'

/*
  认证模块对外的**唯一入口**。

  状态机本体在 `#/lib/store/auth-store`（zustand + persist），本文件只负责：
  1. 转出 store 的读口（`useAuth` / `getAuthSnapshot` / `subscribeAuth`）与写口（函数式 API）；
  2. 与后端交互的会话流程（`apiLogin` / `fetchAvailableApps` / `resolveAuthenticatedLanding`）；
  3. 模块级副作用：API 拦截器、初始 base URL 同步、跨标签页同步。

  业务代码一律从这里引 —— 这样「认证怎么实现」与「认证怎么被用」不会缠在一起。
*/

export type { AppItem, UserInfo }
export type { AuthActions, AuthState, AuthStore } from './store/auth-store'
export { DEFAULT_APP_ID, getDefaultApp, isMultiAppEnabled }
export { STORAGE_KEY, redirectToLogin, useAuthStore }

/**
 * 接入后端真实登录 API：
 * 验证账号密码成功后，获取 token、uid，并装配工作空间应用列表
 */
export async function apiLogin(credentials: {
  username: string
  password?: string
  rememberDevice?: boolean
}): Promise<{
  token: string
  user: UserInfo
  apps: AppItem[]
}> {
  const cleanUsername = credentials?.username?.trim() || ''

  if (!cleanUsername) {
    throw new Error('请输入账号')
  }

  if (!credentials?.password || credentials.password.trim().length === 0) {
    throw new Error('请输入密码')
  }

  const { data, response } = await postLogin({
    body: {
      username: cleanUsername,
      password: credentials.password,
      remember: credentials.rememberDevice ?? true,
    },
  })

  // 后端规范：code 为 0 为成功，非 0 为业务异常
  if (!response?.ok || (data && typeof data.code === 'number' && data.code !== 0)) {
    const errorMsg = data?.message || '登录验证失败，请检查账号和密码'
    throw new Error(errorMsg)
  }

  const result = data?.result
  const token = result?.token

  if (!token) {
    throw new Error('登录响应未包含授权 Token')
  }

  /*
    登录瞬间的**临时**角色展示名。
    真实角色以 `GET /permissions` / `GET /profile` 为准（`UserInfo.role` 只用于
    个人资料页拿到 profile 之前的那一帧展示）。

    用**精确匹配**而不是 `includes('super')` / `includes('user')`：后者会把真实
    项目里的 `superuser`、`useradmin` 之类账号判成超管或访客 —— 这是权限语义，
    宁可回落到 `Admin` 也不能猜。
  */
  const previewRoleByUsername: Record<string, string> = {
    'super admin': 'Super Admin',
    superadmin: 'Super Admin',
    admin: 'Admin',
    user: 'Viewer',
  }
  const role = previewRoleByUsername[cleanUsername.toLowerCase()] ?? 'Admin'

  // 纯账号登录，暂不获取额外 profile 接口，不拼接或伪造邮箱
  const user: UserInfo = {
    username: cleanUsername,
    name: cleanUsername,
    role,
    uid: result.uid,
  }

  return {
    token,
    user,
    // 单应用模式下直接提供默认应用，多应用模式下由登录后单独获取
    apps: !isMultiAppEnabled() ? [getDefaultApp()] : [],
  }
}

/**
 * 获取当前账号可授权访问的应用列表：
 * - 单应用模式（默认）：直接返回默认单应用，无需请求后端接口；
 * - 多应用模式：调用 GET /apps 获取应用列表（预留多服务器/多域名空间，每个 App 携带其独立的 apiBaseUrl）。
 */
export async function fetchAvailableApps(): Promise<AppItem[]> {
  if (!isMultiAppEnabled()) {
    return [getDefaultApp()]
  }

  try {
    const { data } = await getApps()
    return toAppItems((data?.result ?? []) as AppPayload[])
  } catch {
    // 接口不可用时返回空列表：调用方引导用户检查服务，而不是让登录页崩掉
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* 已登录用户的落点推导（登录 / 注册 / 找回页的 beforeLoad 共用）                 */
/* -------------------------------------------------------------------------- */

/** 看起来像站内路径、且不是「选择页本身」的回跳地址才认（防开放重定向）。 */
function safeRedirectTarget(redirect?: string): string | undefined {
  if (!redirect || !redirect.startsWith('/')) return undefined
  if (redirect === '/' || redirect === '/select-app') return undefined
  return redirect
}

/**
 * 已登录用户访问认证页时该被送到哪 —— 四处 `beforeLoad` 的唯一实现。
 *
 * | 部署形态 | 落点 |
 * |---|---|
 * | 单应用 | 有 `?redirect` 就回它，否则 `/$DEFAULT_APP_ID/home` |
 * | 多应用 · 已选定应用 | 有 `?redirect` 就回它，否则 `/$currentApp/home` |
 * | 多应用 · 未选定应用 | 回 `/` 继续选择（带上 `redirect` 供选完再跳） |
 */
export function resolveAuthenticatedLanding(
  auth: Pick<AuthStore, 'currentApp'>,
  redirect?: string,
): { to: string; search?: { redirect?: string } } {
  const target = safeRedirectTarget(redirect)

  if (!isMultiAppEnabled()) {
    return { to: target ?? `/${auth.currentApp?.id || DEFAULT_APP_ID}/home` }
  }
  if (auth.currentApp) {
    return { to: target ?? `/${auth.currentApp.id}/home` }
  }
  return { to: '/', search: redirect ? { redirect } : undefined }
}

/* -------------------------------------------------------------------------- */
/* 函数式 API（保持 `#/lib/auth` 既有用法）                                     */
/* -------------------------------------------------------------------------- */

export function setAvailableApps(apps: AppItem[]) {
  useAuthStore.getState().setAvailableApps(apps)
}

export function setAuthenticatedSession(sessionData: {
  token: string
  user: UserInfo
  apps: AppItem[]
}) {
  useAuthStore.getState().setAuthenticatedSession(sessionData)
}

export function selectAppAndComplete(selectedAppId: string) {
  useAuthStore.getState().selectAppAndComplete(selectedAppId)
}

export function completeLoginWithApp(
  sessionData: { token: string; user: UserInfo; apps: AppItem[] },
  selectedAppId: string,
) {
  useAuthStore.getState().completeLoginWithApp(sessionData, selectedAppId)
}

export function setCurrentApp(appId: string) {
  useAuthStore.getState().setCurrentApp(appId)
}

export async function logout() {
  await useAuthStore.getState().logout()
}

/** 非 React 上下文读取认证快照（路由 `beforeLoad` 守卫等）。 */
export function getAuthSnapshot(): AuthStore {
  return useAuthStore.getState()
}

/** 命令式订阅认证状态变化（返回取消订阅函数）。 */
export function subscribeAuth(listener: () => void): () => void {
  return useAuthStore.subscribe(() => listener())
}

/** React Hook：访问全局认证状态与切换操作。 */
export function useAuth() {
  return useAuthStore()
}

// 注册 API 客户端凭据提供器与 401 会话失效回调，解除 API 层对存储层的耦合
configureAuthInterceptors({
  getCredentials: () => {
    const { token, currentApp } = useAuthStore.getState()
    return {
      token,
      // 直接透传当前应用的 id（console / analytics…），由 API 层作为 `X-App-Id` 发出
      appId: currentApp?.id,
    }
  },
  onUnauthorized: () => {
    void logout()
  },
})

// 模块初始化时若已有激活应用并携带独立 apiBaseUrl，自动同步至客户端
const initialApp = useAuthStore.getState().currentApp
if (initialApp?.apiBaseUrl) {
  updateClientBaseUrl(initialApp.apiBaseUrl)
}

/**
 * 多标签页同步（认证是这个能力里**最要紧**的一处）。
 *
 * 场景：A 标签页登出 / 换了账号 / 切了应用，B 标签页必须跟着走 ——
 * 否则 B 会拿一个已被服务端作废的 Token 继续发请求（等 401 才反应），
 * 或者停留在只有 A 才"有权限"的应用作用域里。
 *
 * `storage` 事件只在**其它**标签页写入时触发，所以这里不会与自身写入回环；
 * rehydrate 完成后：
 * - 先把 app 作用域切到新的 `currentApp`（per-app 的偏好 / 表格状态随之 rehydrate）；
 * - 若已被登出，直接 `redirectToLogin()` 离开受保护页面（与 401 拦截器同一收口）。
 */
enableCrossTabSync(useAuthStore, {
  storageName: STORAGE_KEY,
  onExternalChange: (state) => {
    setAppScope(state.currentApp?.id)
    if (!state.isAuthenticated) {
      redirectToLogin()
    }
  },
})
