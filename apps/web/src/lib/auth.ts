import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import {
  configureAuthInterceptors,
  DEFAULT_API_BASE_URL,
  getApps,
  postLogin,
  postLogout,
  updateClientBaseUrl,
} from '#/api'
import {
  DEFAULT_APP_ID,
  getDefaultApp,
  iconForAppId,
  toAppItems,
  type AppItem,
  type AppPayload,
  type UserInfo,
} from './app-registry'
import { isMultiAppEnabled } from './app-config'
import { clearAllQueryCaches } from './query-client'
import { setAppScope } from './store/app-scope'
import { enableCrossTabSync } from './store/cross-tab-sync'

export type { AppItem, UserInfo }
export { DEFAULT_APP_ID, getDefaultApp, isMultiAppEnabled }

/**
 * 认证与应用状态（zustand + persist）。
 *
 * 这里是全站唯一的认证真值来源：
 * - 数据部分只有「凭证 + 可用应用 + 当前应用」，任何组件读它都拿到同一份；
 * - 用 `persist` 落到 `localStorage` 的 `admin.auth-state`（沿用旧键，格式升级见
 *   `authPersistStorage`，老会话不必重新登录）；
 * - `currentApp` 变化时同步 **app 作用域**（`#/lib/store/app-scope`），
 *   per-app 的持久化状态（表格列设置等）据此切到对应命名空间；
 * - 查询缓存按应用分区（`#/lib/query-client`），所以切应用**不再清空缓存**，
 *   只有登录 / 登出这种身份边界才 `clearAllQueryCaches()`。
 */
export interface AuthState {
  isAuthenticated: boolean
  token: string | null
  user: UserInfo | null
  availableApps: AppItem[]
  currentApp: AppItem | null
}

export interface AuthActions {
  /** 阶段一：账号密码认证成功，写入凭据与可用应用列表（此时还没有选定应用）。 */
  setAuthenticatedSession: (sessionData: {
    token: string
    user: UserInfo
    apps: AppItem[]
  }) => void
  /** 动态更新可用应用列表。 */
  setAvailableApps: (apps: AppItem[]) => void
  /** 阶段二：选定具体 App，设置 currentApp 并同步 API Base URL 与 app 作用域。 */
  selectAppAndComplete: (selectedAppId: string) => void
  /** 一步完成登录并选定 App。 */
  completeLoginWithApp: (
    sessionData: { token: string; user: UserInfo; apps: AppItem[] },
    selectedAppId: string,
  ) => void
  /** 手动切换当前应用。 */
  setCurrentApp: (appId: string) => void
  /** 退出登录（先通知服务端，再清理本地状态与缓存，最后离开受保护页面）。 */
  logout: () => Promise<void>
}

export type AuthStore = AuthState & AuthActions

const STORAGE_KEY = 'admin.auth-state'

/** 持久化格式版本：旧版是无包装的裸对象，读取时就地升级（见 `authPersistStorage`）。 */
const AUTH_STORE_VERSION = 1

/** 可序列化的应用描述（`icon` 是 React 组件，不能进 JSON）。 */
type PersistedApp = Omit<AppItem, 'icon'>

interface PersistedAuthState {
  isAuthenticated: boolean
  token: string | null
  user: UserInfo | null
  availableApps: PersistedApp[]
  currentApp: PersistedApp | null
}

function serializeApp(app: AppItem): PersistedApp {
  return {
    id: app.id,
    name: app.name,
    headline: app.headline,
    description: app.description,
    domain: app.domain,
    badge: app.badge,
    category: app.category,
    themeGradient: app.themeGradient,
    apiBaseUrl: app.apiBaseUrl,
    iconWeight: app.iconWeight,
  }
}

/**
 * 从存档恢复应用：图标与元数据以应用池配置为准。
 *
 * `icon` / `iconWeight` 是**前端呈现资源**，只认 `ALL_SYSTEM_APPS`，不读存档里的旧值 ——
 * 否则改了配置（例如把图标权重从 fill 换回 regular）会被旧会话的存档顶回去。
 */
function hydrateApp(app: PersistedApp): AppItem {
  return {
    ...app,
    icon: iconForAppId(app.id),
  }
}

function hydratePersistedState(persisted: PersistedAuthState): AuthState {
  const rawApps = Array.isArray(persisted.availableApps) ? persisted.availableApps : []
  let availableApps = rawApps.map(hydrateApp)
  let currentApp = persisted.currentApp ? hydrateApp(persisted.currentApp) : null

  // 单应用模式下，确保应用列表与当前激活应用统一为当前的默认单应用
  if (!isMultiAppEnabled()) {
    const defaultApp = getDefaultApp()
    if (availableApps.length === 0 || !availableApps.some((a) => a.id === defaultApp.id)) {
      availableApps = [defaultApp]
    }
    if (!currentApp || currentApp.id !== defaultApp.id) {
      currentApp = defaultApp
    }
  }

  return {
    isAuthenticated: Boolean(persisted.token && persisted.user),
    token: persisted.token ?? null,
    user: persisted.user ?? null,
    availableApps,
    currentApp,
  }
}

/**
 * 认证状态的持久化 storage。
 *
 * 两件事：
 * 1. **格式升级**：旧版手写 store 存的是裸状态对象（`{ isAuthenticated, token, ... }`），
 *    而 zustand persist 期望 `{ state, version }`。这里检测到没有 `state` 字段就就地包装，
 *    于是升级到 zustand 不需要用户重新登录；
 * 2. 直接手写 JSON 收发，避免再套一层 `createJSONStorage`（这里本来就要解析原始串）。
 */
const authPersistStorage: PersistStorage<PersistedAuthState> = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(name)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!('state' in parsed)) {
        return {
          state: parsed as unknown as PersistedAuthState,
          version: AUTH_STORE_VERSION,
        }
      }
      return parsed as unknown as StorageValue<PersistedAuthState>
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(name, JSON.stringify(value))
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(name)
  },
}

/** 是否正在登出：防止并发 / 递归触发（见 `logout()` 内的用法）。 */
let loggingOut = false

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      user: null,
      availableApps: !isMultiAppEnabled() ? [getDefaultApp()] : [],
      currentApp: !isMultiAppEnabled() ? getDefaultApp() : null,

      setAuthenticatedSession: ({ token, user, apps }) => {
        set({
          isAuthenticated: true,
          token,
          user,
          availableApps: apps,
          currentApp: null,
        })
        // 还没选定应用：per-app 数据回到 global 命名空间
        setAppScope(null)
      },

      setAvailableApps: (apps) => {
        set({
          availableApps: apps,
        })
      },

      selectAppAndComplete: (selectedAppId) => {
        const { availableApps } = get()
        const chosenApp =
          availableApps.find((app) => app.id === selectedAppId) ?? availableApps[0]
        // 应用列表为空（接口未就绪）时保持未选定，由页面引导重新加载
        if (!chosenApp) return

        set({ currentApp: chosenApp })

        // 切换应用 = 切换数据域：只切作用域，**不清缓存**（分区保证互不污染）
        setAppScope(chosenApp.id)

        // 将选定应用的服务地址动态设置为后续业务接口请求的基准地址
        if (chosenApp.apiBaseUrl) {
          updateClientBaseUrl(chosenApp.apiBaseUrl)
        }
      },

      completeLoginWithApp: ({ token, user, apps }, selectedAppId) => {
        const chosenApp = apps.find((app) => app.id === selectedAppId) ?? apps[0]
        if (!chosenApp) return

        set({
          isAuthenticated: true,
          token,
          user,
          availableApps: apps,
          currentApp: chosenApp,
        })

        // 新会话登录：清空上一个会话残留的所有应用缓存，再切到新作用域
        clearAllQueryCaches()
        setAppScope(chosenApp.id)

        if (chosenApp.apiBaseUrl) {
          updateClientBaseUrl(chosenApp.apiBaseUrl)
        }
      },

      setCurrentApp: (appId) => {
        const { availableApps } = get()
        const target = availableApps.find((app) => app.id === appId)
        if (!target) return

        set({ currentApp: target })

        // 手动切换应用：同样是数据域切换，缓存按应用分区保留，只切作用域
        setAppScope(target.id)

        if (target.apiBaseUrl) {
          updateClientBaseUrl(target.apiBaseUrl)
        }
      },

      logout: async () => {
        // 防止并发/递归登出（401 → logout → /logout 又 401 → logout …）重复请求与重复清理
        if (loggingOut) return
        loggingOut = true

        const currentToken = get().token
        try {
          if (currentToken) {
            await postLogout({
              headers: {
                Authorization: `Bearer ${currentToken}`,
              },
            }).catch(() => {})
          }
        } catch {
          // 忽略断网与离线异常
        } finally {
          set({
            isAuthenticated: false,
            token: null,
            user: null,
            availableApps: [],
            currentApp: null,
          })

          setAppScope(null)

          // 重置回默认基础地址
          updateClientBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

          // 退出登录：清空所有应用的查询缓存，避免下一个账号看到上一个账号的数据
          clearAllQueryCaches()

          loggingOut = false
        }

        // 状态已清理（isAuthenticated === false），此时离开受保护页面不会被守卫弹回
        redirectToLogin()
      },
    }),
    {
      name: STORAGE_KEY,
      version: AUTH_STORE_VERSION,
      storage: authPersistStorage,
      // 只持久化数据，action 不落盘
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        token: state.token,
        user: state.user,
        availableApps: state.availableApps.map(serializeApp),
        currentApp: state.currentApp ? serializeApp(state.currentApp) : null,
      }),
      // 存档里的应用只有可序列化字段，水合时按应用池配置补回图标与元数据
      merge: (persisted, current) => {
        if (!persisted) return current
        return {
          ...current,
          ...hydratePersistedState(persisted as PersistedAuthState),
        }
      },
      // 水合完成即把激活应用同步到 app 作用域：per-app store 据此读对应命名空间
      onRehydrateStorage: () => (state) => {
        const targetId = state?.currentApp?.id || (!isMultiAppEnabled() ? DEFAULT_APP_ID : undefined)
        setAppScope(targetId)
      },
    },
  ),
)

/**
 * 离开受保护页面回到登录页。
 *
 * 用整页跳转而不是 SPA 导航：登出是安全边界，顺便把上一个账号留在内存里的
 * 页面数据、Query 缓存外的东西一并丢掉；`replace` 也避免用户按后退回到已登出的页面。
 * 与 401 拦截器（`src/api/index.ts`）的处理方式保持一致。
 */
function redirectToLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/login') return
  window.location.replace('/login')
}

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
  const cleanUsername = credentials.username.trim()

  if (!cleanUsername) {
    throw new Error('请输入账号')
  }

  if (!credentials.password || credentials.password.trim().length === 0) {
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

  // 纯账号登录，暂不获取额外 profile 接口，不拼接或伪造邮箱
  const user: UserInfo = {
    username: cleanUsername,
    name: cleanUsername,
    role: 'Admin',
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
