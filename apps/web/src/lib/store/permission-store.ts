import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerScopedStore } from './app-scope'
import { enableCrossTabSync } from './cross-tab-sync'
import { createScopedJSONStorage } from './scoped-storage'

/**
 * 权限计算对象：按 RBAC 角色与通配符规则预先计算出的结构化对象。
 * 存储到 store 中，支持 O(1) 快速查询、模块级动作查找与复杂权限断言。
 */
export interface ComputedPermissions {
  /** 是否具备超级管理员权限（角色判定或含 '*' / '*:*' 通配） */
  isSuperAdmin: boolean
  /** 拥有的通配符规则集合（如 'user:*', '*:read'） */
  wildcards: string[]
  /** 扁平化的直接权限点映射表，供 O(1) 精确命中检测 */
  permissionMap: Record<string, boolean>
  /** 按模块和动作结构化划分的字典，形如 modules.user.read === true */
  modules: Record<string, Record<string, boolean>>
}

/** 权限要求定义（支持单字符串、通配、数组、对象配置或自定义函数） */
export type PermissionRequirement =
  | string
  | readonly string[]
  | {
      /** 任一满足即通过 (OR) */
      any?: readonly string[]
      /** 全部满足才通过 (AND) */
      all?: readonly string[]
      /** 角色匹配要求 */
      role?: string | readonly string[]
      /** 自定义判定函数 */
      custom?: (context: {
        role: string
        permissions: readonly string[]
        computed: ComputedPermissions
      }) => boolean
    }

export interface PermissionState {
  /** 当前用户角色标识（如 'Super Admin', 'editor', 'viewer'） */
  role: string
  /** 当前用户的原始权限点数组 */
  permissions: string[]
  /** 结构化计算后的权限对象（存储在 store） */
  computed: ComputedPermissions
  /** 上次拉取或更新时间戳 */
  lastUpdated: number | null
}

export interface PermissionActions {
  /** 更新当前角色的权限点清单并重新计算 computed 权限对象 */
  setPermissions: (data: { role?: string; permissions?: readonly string[] }) => void
  /** 清空权限状态（登出或切换账号时使用） */
  resetPermissions: () => void
}

export type PermissionStore = PermissionState & PermissionActions

export const PERMISSIONS_STORAGE_KEY = 'admin.permissions'

/**
 * 角色名归一化：抹平大小写与分隔符差异（`Super-Admin` / `Super Admin` → `superadmin`）。
 *
 * 单独抽出来是因为**判定超管的地方不止一处**（本文件与 `hasPermission` 的调用链），
 * 各写一份 `role === 'admin'` 这种字面比较就会立刻分叉。
 */
export function normalizeRoleName(role = ''): string {
  return role.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * 根据原始权限点与角色，计算结构化权限对象。
 *
 * **`Admin` 不是超管**：Mock 与真实后端里 `Admin`（业务管理员）是**受限角色**
 * （无 `:delete`）。只有 `Super Admin` 这类角色名，或权限点里出现 `*` / `*:*`
 * 才视为超管 —— 否则 `hasPermission` 的第一道 `isSuperAdmin` 短路会让
 * 「admin 不能删」整条收敛链失效。
 */
export function computePermissions(
  permissions: readonly string[] = [],
  role = '',
): ComputedPermissions {
  const normalizedRole = normalizeRoleName(role)
  const isSuperAdmin =
    normalizedRole === 'superadmin' ||
    normalizedRole === 'super' ||
    permissions.includes('*') ||
    permissions.includes('*:*')

  const wildcards: string[] = []
  const permissionMap: Record<string, boolean> = {}
  const modules: Record<string, Record<string, boolean>> = {}

  for (const perm of permissions) {
    if (!perm) continue
    permissionMap[perm] = true
    if (perm.includes('*')) {
      wildcards.push(perm)
    }
    const colonIdx = perm.indexOf(':')
    if (colonIdx !== -1) {
      const mod = perm.slice(0, colonIdx)
      const action = perm.slice(colonIdx + 1)
      if (!modules[mod]) {
        modules[mod] = {}
      }
      modules[mod][action] = true
    }
  }

  return {
    isSuperAdmin,
    wildcards,
    permissionMap,
    modules,
  }
}

type PersistedPermission = Pick<
  PermissionState,
  'role' | 'permissions' | 'computed' | 'lastUpdated'
>

const initialComputed = computePermissions([], '')

/**
 * 权限状态管理 store（按应用隔离存储，支持跨标签页同步）。
 *
 * 遵循项目设计：
 * - 存储键 `admin.permissions:<appId>`，不同应用权限状态隔离；
 * - 切换应用时由 `registerScopedStore` 触发重新水合；
 * - 存储结构包含预计算的 `computed` 对象，提供极致的运行时性能。
 */
export const usePermissionStore = create<PermissionStore>()(
  persist(
    (set) => ({
      role: '',
      permissions: [],
      computed: initialComputed,
      lastUpdated: null,

      setPermissions: ({ role, permissions = [] }) => {
        const nextRole = role !== undefined ? role : ''
        const nextPermissions = [...permissions]
        const computed = computePermissions(nextPermissions, nextRole)
        set({
          role: nextRole,
          permissions: nextPermissions,
          computed,
          lastUpdated: Date.now(),
        })
      },

      resetPermissions: () =>
        set({
          role: '',
          permissions: [],
          computed: computePermissions([], ''),
          lastUpdated: null,
        }),
    }),
    {
      name: PERMISSIONS_STORAGE_KEY,
      storage: createScopedJSONStorage<PersistedPermission>({ fallbackToGlobal: true }),
      partialize: (state) => ({
        role: state.role,
        permissions: state.permissions,
        computed: state.computed,
        lastUpdated: state.lastUpdated,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedPermission>
        const role = saved.role ?? current.role
        const permissions = saved.permissions ?? current.permissions
        return {
          ...current,
          role,
          permissions,
          computed: saved.computed ?? computePermissions(permissions, role),
          lastUpdated: saved.lastUpdated ?? current.lastUpdated,
        }
      },
    },
  ),
)

// 切换应用时从 `admin.permissions:<新 appId>` 重新水合
registerScopedStore('permissions', () => {
  void usePermissionStore.persist.rehydrate()
})

// 多标签页同步：权限在其它标签页更新后跟随
enableCrossTabSync(usePermissionStore, {
  storageName: PERMISSIONS_STORAGE_KEY,
  scoped: true,
})
