import { createKumoToastManager } from '@cloudflare/kumo'

/**
 * 全局 toast 管理器（模块作用域）。
 *
 * Kumo 的 `useKumoToastManager()` 是 React hook，只能在组件里用；
 * 而 API 响应拦截器、query 缓存回调这类非 React 上下文也需要弹提示，
 * 因此这里用 `createKumoToastManager()` 建一个共享实例，并在 `__root.tsx`
 * 通过 `<Toasty toastManager={appToastManager}>` 挂载 —— 两条路径共用同一个队列。
 */
export const appToastManager = createKumoToastManager()

/** 同一条文案的去重窗口：并发请求同时失败时不刷屏。 */
const DEDUPE_WINDOW_MS = 3000

const lastNotifiedAt = new Map<string, number>()

/**
 * 业务错误提示的统一入口（拦截器与业务代码都可调用）。
 *
 * 之所以带上按文案去重：一次页面渲染可能同时打多个请求，后端返回同一条错误时
 * 每个请求都会走到这里，不去重会连续弹好几个一模一样的 toast。
 */
export function notifyApiError(message: string) {
  const now = Date.now()
  const last = lastNotifiedAt.get(message) ?? 0
  if (now - last < DEDUPE_WINDOW_MS) return

  lastNotifiedAt.set(message, now)
  appToastManager.add({ title: message, variant: 'error' })
}
