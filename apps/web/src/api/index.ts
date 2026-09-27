import { ApiError } from '#/lib/api-error'
import { notifyApiError } from '#/lib/toast'
import { client } from './generated/client.gen'

/**
 * 默认为仓库内置的 Mock API（见 `apps/mock/README.md`）。
 *
 * 开源版本刻意不内置任何私有后端地址：`clone` 之后启动 mock 即可跑通全站。
 * 需要连真实后端时，在 `.env.local` 里覆盖 `VITE_API_BASE_URL`。
 *
 * 注意这里**不带 `/api` 之类的路径前缀**：契约里每个接口的 path 都是完整的
 * （`/user`、`/system/menu/tree`…），客户端直接拼在 baseUrl 之后。
 */
export const DEFAULT_API_BASE_URL = 'http://localhost:3001'

/**
 * 设置 API 客户端基础请求地址。
 * 业务页面的接口统一采用当前选定 App 的 apiBaseUrl（或默认地址）。
 * 预留多服务器/多域名接口切换空间。
 */
export function updateClientBaseUrl(url: string = DEFAULT_API_BASE_URL) {
  client.setConfig({
    baseUrl: url,
  })
}

export interface AuthCredentials {
  token?: string | null
  appId?: string | null
}

let credentialsProvider: (() => AuthCredentials) | null = null
let unauthorizedHandler: (() => void) | null = null

/**
 * 注册认证凭据提供器与 401 拦截处理函数。
 * 避免 API 拦截器直接操作或硬编码外部存储键名，实现鉴权模块解耦。
 */
export function configureAuthInterceptors(options: {
  getCredentials: () => AuthCredentials
  onUnauthorized: () => void
}) {
  credentialsProvider = options.getCredentials
  unauthorizedHandler = options.onUnauthorized
}

updateClientBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

// 请求拦截器：附加当前登录会话的 Authorization 与 X-App-Id 标头
client.interceptors.request.use((request) => {
  const credentials = credentialsProvider?.()

  if (credentials?.token && !request.headers.has('Authorization')) {
    request.headers.set('Authorization', `Bearer ${credentials.token}`)
  }

  // 当前应用标识（console / analytics…）：随请求带给后端，便于按应用隔离数据
  const appId = credentials?.appId
  if (appId && !request.headers.has('X-App-Id')) {
    request.headers.set('X-App-Id', appId)
  }

  return request
})

// 响应拦截器：
// 1) 会话失效（HTTP 401）：清理本地状态并重定向至登录页；
// 2) 业务码 `code !== 0`：后端用「HTTP 200 + 非 0 code」表达业务失败，
//    不拦下来会被当成成功继续走（弹窗误关、列表误刷新），这里统一 toast 提示并抛出 ApiError。
client.interceptors.response.use((response) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    try {
      unauthorizedHandler?.()
      if (window.location.pathname !== '/login') {
        // 用 replace 而非 href：会话失效后不允许通过浏览器后退回到受保护页面
        window.location.replace('/login')
      }
    } catch {
      // 忽略回调处理异常
    }
    return response
  }

  const payload = (response as { _data?: { code?: unknown; message?: unknown } })._data
  const code = payload?.code

  if (typeof code === 'number' && code !== 0) {
    const message =
      typeof payload?.message === 'string' && payload.message
        ? payload.message
        : '请求失败，请稍后重试'

    // 全局提示（同文案在短时间内会去重，避免并发请求刷屏）
    notifyApiError(message)
    // 抛出后：mutation 的 catch 会走失败分支，query 进入 error 状态且不做重试
    throw new ApiError(message, { code, data: payload })
  }

  return response
})

// 统一导出自动生成的 SDK 方法、类型以及预配置客户端
export * from './generated'
// 运行时 JSON Schema（@hey-api/schemas 产物）：供表格列自动编排与表单校验复用
export * from './generated/schemas.gen'
// TanStack Query 产物（@tanstack/react-query 插件）：
// 每个接口都会生成 `xxxOptions()` / `xxxQueryKey()` / `xxxMutation()`，
// 页面直接用 useQuery(useMutation) 接入即可获得缓存、去重与失效重取能力
export * from './generated/@tanstack/react-query.gen'
export { client } from './generated/client.gen'
