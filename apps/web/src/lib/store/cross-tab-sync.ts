import type { StoreApi } from 'zustand'
import { GLOBAL_APP_SCOPE, getAppScope } from './app-scope'

/**
 * 多标签页状态同步。
 *
 * 背景：zustand 的 `persist` **只负责当前标签页** —— 它启动时 hydrate 一次、
 * 之后每次 set 写盘，但**不监听**其它标签页的写入（官方 persist 参考页只承诺
 * "persist a store's state across page reloads or application restarts"，
 * 源码里也没有任何 addEventListener；旧文档 FAQ 的答复就是「用 Persist API 自己实现」）。
 * 于是同一账号开两个标签页时，一边改了主题/语言/列设置、或登出，另一边完全不知道。
 *
 * 做法（浏览器原生、零依赖）：
 * 1. 监听 `window` 的 `storage` 事件 —— 它**只由其它标签页写入时触发，本页自己的
 *    写入不会触发**，所以天然不会回环（不需要"忽略自己写入"的标记）；
 * 2. 事件命中本 store 的键时，调用 `persist.rehydrate()` 从 localStorage 重新读取，
 *    再执行调用方给的副作用（例如认证失效后跳登录页）；
 * 3. 返回取消订阅函数，便于测试或热更新时清理。
 *
 * 为什么不用 BroadcastChannel：它需要额外的协议（消息格式、版本、作用域），而
 * `storage` 事件已经精确携带 `key` / `newValue`，且**写盘与广播是同一次原子操作**，
 * 不会出现「盘上旧值 + 广播新值」的分叉。BroadcastChannel 只在「不想落盘也要广播」
 * 时才更合适，本项目的状态本来就是持久化的。
 *
 * 作用域键的处理：per-app store 的实际键是 `<name>:<appId>`（见 `scoped-storage`），
 * 所以匹配时认 `<name>:<当前 appId>` 与 `<name>:global`（基线）两种；
 * 其它应用作用域的键即使变了也不该影响本页。
 */
interface PersistedStoreApi<T> extends StoreApi<T> {
  persist: {
    /** 从 storage 重新读取并合并进 store（localStorage 是同步 storage，实际同步完成） */
    rehydrate: () => void | Promise<void>
  }
}

interface CrossTabSyncOptions<T> {
  /** `persist` 的 `name`（不带作用域后缀） */
  storageName: string
  /** 键是否带 `:<appId>` 后缀（per-app store 为 true，全局 store 省略） */
  scoped?: boolean
  /** 远端更新并完成 rehydrate 之后执行，参数是更新后的 store 状态 */
  onExternalChange?: (state: T) => void
}

export function enableCrossTabSync<T>(
  store: PersistedStoreApi<T>,
  { storageName, scoped = false, onExternalChange }: CrossTabSyncOptions<T>,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const matches = (key: string | null): boolean => {
    // `localStorage.clear()` 触发的事件 key 为 null：无法判断来源，保守地当作相关
    if (key === null) return true
    if (!scoped) return key === storageName
    return (
      key === `${storageName}:${getAppScope()}` ||
      key === `${storageName}:${GLOBAL_APP_SCOPE}`
    )
  }

  const onStorage = (event: StorageEvent) => {
    // 只处理 localStorage（排除 sessionStorage 等），并在拿不到 storageArea 时放行
    if (event.storageArea && event.storageArea !== window.localStorage) return
    if (!matches(event.key)) return

    void Promise.resolve(store.persist.rehydrate()).then(() => {
      onExternalChange?.(store.getState())
    })
  }

  window.addEventListener('storage', onStorage)
  const dispose = () => window.removeEventListener('storage', onStorage)

  // Vite HMR：模块热替换会重新执行这个文件，旧监听器必须摘掉，否则开发期会叠加
  // （行为上只是多几次幂等 rehydrate，但会一直累积）
  ;(
    import.meta as { hot?: { dispose: (callback: () => void) => void } }
  ).hot?.dispose(dispose)

  return dispose
}
