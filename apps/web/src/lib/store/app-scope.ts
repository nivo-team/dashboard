/**
 * 应用作用域（App Scope）。
 *
 * 用于「同一份前端状态、按应用隔离存储」：所有 per-app 的持久化状态（表格列设置、
 * 筛选条件、分页等）都以当前作用域作为 localStorage 键的后缀，切换应用即切换命名空间。
 *
 * 与认证 store 的关系：`currentApp` 变化时调用 `setAppScope(appId)`，这里负责广播，
 * 让每个 scoped store 从新命名空间重新水合（rehydrate）。
 */

/** 未选定应用（停留在 `/`、`/settings/*` 等外壳页）时使用的命名空间。 */
export const GLOBAL_APP_SCOPE = 'global'

let currentScope = GLOBAL_APP_SCOPE

type ScopeListener = (scope: string) => void
const listeners = new Set<ScopeListener>()

/** 读取当前作用域（scoped storage 生成键时使用）。 */
export function getAppScope(): string {
  return currentScope
}

/** 订阅作用域变化（返回取消订阅函数）。 */
export function subscribeAppScope(listener: ScopeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 注册一个「需要跟随作用域重新水合」的 store。
 *
 * 这里存的是 rehydrate 函数而不是 store 实例，避免基础模块反向依赖具体 store。
 */
const rehydrators = new Map<string, () => void>()

export function registerScopedStore(id: string, rehydrate: () => void) {
  rehydrators.set(id, rehydrate)
}

/**
 * 切换当前应用作用域。
 *
 * 顺序很关键：先改 `currentScope`（scoped storage 之后读写的是新命名空间），
 * 再逐个 rehydrate。localStorage 是同步 storage，zustand 的 rehydrate 会同步完成，
 * 因此不会出现「读到上一个应用数据」的中间帧。
 */
export function setAppScope(appId: string | null | undefined) {
  const next = appId && appId.length > 0 ? appId : GLOBAL_APP_SCOPE
  if (next === currentScope) return
  currentScope = next
  listeners.forEach((listener) => listener(next))
  rehydrators.forEach((rehydrate) => rehydrate())
}
