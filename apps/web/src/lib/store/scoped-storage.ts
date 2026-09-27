import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware'
import { GLOBAL_APP_SCOPE, getAppScope } from './app-scope'

/**
 * 持久化键的作用域后缀：`<name>:<appId>`（未选定应用时为 `:global`）。
 */
function scopedKey(name: string): string {
  return `${name}:${getAppScope()}`
}

function globalKey(name: string): string {
  return `${name}:${GLOBAL_APP_SCOPE}`
}

export interface ScopedStorageOptions {
  /**
   * 当前作用域没有数据时，回落到 `:global` 命名空间。
   *
   * 用于「每个应用各自一份、但首次进入新应用时继承登录前基线」的偏好：
   * 用户在某个应用里改过之后才写自己的键，此前一直读基线。
   * 表格 UI 这类**不该继承**的状态不要开这个开关。
   */
  fallbackToGlobal?: boolean
  /**
   * 兼容历史**无后缀**键：把 `name` 本身（如 `admin.preferences`）也当作读取来源。
   * 仅用于升级期迁移，写入始终落到带后缀的新键。
   */
  legacyUnscoped?: boolean
}

/**
 * 创建「按应用分区」的 persist storage。
 *
 * 同一个 `name` 在不同应用下落在不同 localStorage 键上（`admin.table-ui:console` /
 * `admin.table-ui:analytics`），做到物理隔离：既不会互相覆盖，也不会把所有应用的数据
 * 堆在同一个键里。切回某个应用时它的历史状态仍在。
 *
 * 读取优先级：`<name>:<当前 appId>` → （可选）无后缀历史键 → （可选）`:global` 基线。
 * 每个方法都**在读写的当下**求值作用域，所以 `setAppScope()` 之后无需重建 storage。
 */
export function createScopedJSONStorage<S>(
  options: ScopedStorageOptions = {},
): PersistStorage<S, unknown> | undefined {
  const { fallbackToGlobal = false, legacyUnscoped = false } = options

  const storage: StateStorage = {
    getItem: (name) => {
      if (typeof window === 'undefined') return null

      const current = window.localStorage.getItem(scopedKey(name))
      if (current !== null) return current

      if (legacyUnscoped) {
        const legacy = window.localStorage.getItem(name)
        if (legacy !== null) return legacy
      }

      if (fallbackToGlobal && getAppScope() !== GLOBAL_APP_SCOPE) {
        return window.localStorage.getItem(globalKey(name))
      }

      return null
    },
    setItem: (name, value) => {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(scopedKey(name), value)
    },
    removeItem: (name) => {
      if (typeof window === 'undefined') return
      window.localStorage.removeItem(scopedKey(name))
    },
  }

  return createJSONStorage<S>(() => storage)
}
