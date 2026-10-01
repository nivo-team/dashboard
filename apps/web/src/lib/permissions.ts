import { useCallback, useEffect, useMemo } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { getPermissionsQueryOptions } from '#/api'
import type { GetPermissionsResponse } from '#/api'
import {
  computePermissions,
  usePermissionStore,
  type ComputedPermissions,
  type PermissionRequirement,
} from '#/lib/store'

export type { ComputedPermissions, PermissionRequirement }

/**
 * 当前用户的**权限点清单**（细到按钮级，来自后端）。
 *
 * ## 它的定位：上限，不是开关
 *
 * | | 谁决定 | 作用 |
 * |---|---|---|
 * | **后端权限点**（本文件） | 后端 RBAC | 用户**真实拥有的**能力 —— AI 授权不能超过它 |
 * | `aiPermission` / `aiAllowedTools` | 用户自己（本机偏好） | 在权限范围内**再收紧**（"我只允许 AI 只读"） |
 *
 * 两者**都要过滤**，取交集。用户把偏好开到 `full` 也拿不到他没有权限的工具 ——
 * 这一点由这里保证；而真正的硬边界仍是**执行时后端按用户身份校验**（工具在浏览器里
 * 用用户自己的登录态调接口）。
 *
 * ## 为什么走 react-query
 *
 * - `sendAiMessage`（`chat.ts`）是**模块函数**，不在 React 树里 —— 用
 *   `ensureQueryData` 同步拿到（首次会自动拉一次），不必自己造缓存；
 * - 权限变更不频繁，`staleTime` 给 5 分钟，避免每次发消息都打接口。
 *
 * ## 字段从哪来
 *
 * 请求与类型都直接用**契约生成物**（`@admin/api-client`，经 `#/api` 转发）：后端改字段时
 * 这里跟着报错，而不是静默漂移。所以本文件**不再另写一份 `interface`**。
 */

/** 当前用户的权限点清单（= 契约里 `GET /permissions` 的 `result`）。 */
export type UserPermissions = GetPermissionsResponse['result']

/**
 * 权限上下文接口，包含当前用户的角色、权限点以及预计算的权限对象。
 */
export interface PermissionContext {
  role?: string
  permissions?: readonly string[]
  isSuperAdmin?: boolean
  computed?: ComputedPermissions
}

/** 权限点匹配：`*` 可通配模块或动作（`*:read` = 任一模块的读权限）。 */
export function matchesPermission(owned: string, pattern: string): boolean {
  if (owned === pattern) return true
  if (owned === '*' || owned === '*:*') return true
  const [ownedModule, ownedAction] = owned.split(':')
  const [patternModule, patternAction] = pattern.split(':')
  return (
    (patternModule === '*' || ownedModule === '*' || patternModule === ownedModule) &&
    (patternAction === '*' || ownedAction === '*' || patternAction === ownedAction)
  )
}

/**
 * 从当前 store 或传入的覆盖参数中解析统一的权限上下文。
 */
export function getPermissionContext(override?: PermissionContext): PermissionContext {
  if (override && (override.role !== undefined || override.permissions !== undefined)) {
    const role = override.role ?? ''
    const permissions = override.permissions ?? []
    const computed = override.computed ?? computePermissions(permissions, role)
    return {
      role,
      permissions,
      isSuperAdmin: override.isSuperAdmin ?? computed.isSuperAdmin,
      computed,
    }
  }

  const state = usePermissionStore.getState()
  return {
    role: state.role,
    permissions: state.permissions,
    isSuperAdmin: state.computed.isSuperAdmin,
    computed: state.computed,
  }
}

/**
 * 通用权限判定函数。
 *
 * 支持两种调用形态：
 * 1. 经典签名：`hasPermission(permissions, pattern)` —— 兼容现有 AI 工具与历史调用；
 * 2. 增强签名：`hasPermission(requirement, context?)` —— 支持权限对象、通配、数组、角色配置，
 *    未传 context 时自动从 `usePermissionStore` 读取当前激活状态。
 */
/**
 * `Array.isArray` 的类型守卫签名是 `arg is any[]`，**收窄不了 `readonly string[]`**。
 * 于是 `Array.isArray(requirement)` 之后再访问 `requirement.role` 会报 TS2339
 * （`readonly string[]` 上当然没有 `role`）。用它替代，类型守卫才能正确排除数组分支。
 */
function isPermissionArray(
  requirement: PermissionRequirement,
): requirement is readonly string[] {
  return Array.isArray(requirement)
}

export function hasPermission(
  permissions: readonly string[],
  pattern: string,
): boolean
export function hasPermission(
  requirement?: PermissionRequirement,
  context?: PermissionContext,
): boolean
export function hasPermission(
  arg1?: readonly string[] | PermissionRequirement,
  arg2?: string | PermissionContext,
): boolean {
  // 兼容形态 1：hasPermission(permissions: readonly string[], pattern: string)
  if (Array.isArray(arg1) && typeof arg2 === 'string') {
    const permissions = arg1 as readonly string[]
    const pattern = arg2
    return permissions.some((owned) => matchesPermission(owned, pattern))
  }

  const requirement = arg1 as PermissionRequirement | undefined
  const context = getPermissionContext(arg2 as PermissionContext | undefined)

  // 1. 未声明权限要求时，默认公开放行
  if (!requirement) return true

  // 2. 超级管理员直接拥有全量权限
  if (context.isSuperAdmin) return true

  const permissions = context.permissions ?? []
  const computed = context.computed

  // 3. 字符串模式（支持通配符）
  if (typeof requirement === 'string') {
    if (computed?.permissionMap[requirement]) return true
    return permissions.some((owned) => matchesPermission(owned, requirement))
  }

  // 4. 数组模式：默认全部满足 (ALL)
  if (isPermissionArray(requirement)) {
    if (requirement.length === 0) return true
    return requirement.every((req) => hasPermission(req, context))
  }

  // 5. 对象模式：支持 any, all, role 以及 custom 自定义判定函数
  if (typeof requirement === 'object' && requirement !== null) {
    if (requirement.role) {
      const allowedRoles = Array.isArray(requirement.role)
        ? requirement.role
        : [requirement.role]
      const currentRole = context.role?.toLowerCase() ?? ''
      const matchesRole = allowedRoles.some((r) => r.toLowerCase() === currentRole)
      if (!matchesRole) return false
    }

    if (requirement.all && requirement.all.length > 0) {
      const passesAll = requirement.all.every((req) => hasPermission(req, context))
      if (!passesAll) return false
    }

    if (requirement.any && requirement.any.length > 0) {
      const passesAny = requirement.any.some((req) => hasPermission(req, context))
      if (!passesAny) return false
    }

    if (requirement.custom) {
      return requirement.custom({
        role: context.role ?? '',
        permissions,
        computed: computed ?? computePermissions(permissions, context.role),
      })
    }

    return true
  }

  return true
}

/**
 * 校验当前用户是否拥有指定权限中的任意一项 (OR 关系)。
 */
export function hasAnyPermission(
  requirements: readonly string[],
  context?: PermissionContext,
): boolean {
  if (!requirements.length) return true
  return requirements.some((req) => hasPermission(req, context))
}

/**
 * 校验当前用户是否同时拥有指定的所有权限 (AND 关系)。
 */
export function hasAllPermissions(
  requirements: readonly string[],
  context?: PermissionContext,
): boolean {
  if (!requirements.length) return true
  return requirements.every((req) => hasPermission(req, context))
}

export interface PermissionFilterOptions<T> {
  /** 提取该项的权限要求，未指定时尝试读取 item.permission ?? item.permissions */
  getPermission?: (item: T) => PermissionRequirement | undefined
  /** 获取子级项的函数，如 item.children */
  getChildren?: (item: T) => T[] | undefined
  /** 生成带过滤后子级项的新对象的函数 */
  withChildren?: (item: T, filteredChildren: T[]) => T
  /** 当子级全部被过滤掉时，是否移除该父级（当父级不是独立有效链接时）。默认 true */
  pruneEmpty?: boolean
  /** 显式传入权限上下文，未提供则读取 store */
  context?: PermissionContext
  /** 额外的自定义过滤谓词 */
  filterPredicate?: (item: T) => boolean
}

/**
 * 通用树形/列表权限过滤函数。
 * 可用于过滤导航菜单、表格操作列、指令列表等任意具备层级或扁平的数据结构。
 */
export function filterByPermission<T>(
  items: readonly T[],
  options?: PermissionFilterOptions<T>,
): T[] {
  const getPerm =
    options?.getPermission ??
    ((item: any) => item?.permission ?? item?.permissions)
  const getChildren =
    options?.getChildren ??
    ((item: any) => (Array.isArray(item?.children) ? item.children : undefined))
  const withChildren =
    options?.withChildren ??
    ((item: any, children: T[]) => ({ ...item, children }))
  const pruneEmpty = options?.pruneEmpty ?? true
  const context = getPermissionContext(options?.context)
  const predicate = options?.filterPredicate

  const result: T[] = []

  for (const item of items) {
    if (predicate && !predicate(item)) {
      continue
    }

    const perm = getPerm(item)
    const isSelfPermitted = hasPermission(perm, context)

    const rawChildren = getChildren(item)
    if (rawChildren && Array.isArray(rawChildren)) {
      const filteredChildren = filterByPermission(rawChildren, options)
      if (filteredChildren.length > 0) {
        if (isSelfPermitted) {
          result.push(withChildren(item, filteredChildren))
        }
      } else if (isSelfPermitted && !pruneEmpty) {
        result.push(withChildren(item, []))
      }
    } else if (isSelfPermitted) {
      result.push(item)
    }
  }

  return result
}

/**
 * React Hook：订阅权限 store，返回可直接喂给 `filterNavGroups` / `filterNavTargets` /
 * `filterShellNavItems` 的上下文（响应式）。
 *
 * 存在的意义：侧边栏、外壳导航、命令面板都要「读 store + 拼 context」，
 * 各写一遍 `{ role, permissions, isSuperAdmin: computed.isSuperAdmin, computed }`
 * 就有漏字段（漏 `isSuperAdmin` = 超管被误判为无权）的风险 —— 统一从这里出。
 */
export function usePermissionContext(): PermissionContext {
  const role = usePermissionStore((state) => state.role)
  const permissions = usePermissionStore((state) => state.permissions)
  const computed = usePermissionStore((state) => state.computed)

  return useMemo(
    () => ({
      role,
      permissions,
      isSuperAdmin: computed.isSuperAdmin,
      computed,
    }),
    [role, permissions, computed],
  )
}

/**
 * React Hook：响应式获取当前权限信息与快捷判断函数。
 */
export function usePermission() {
  const role = usePermissionStore((state) => state.role)
  const permissions = usePermissionStore((state) => state.permissions)
  const computed = usePermissionStore((state) => state.computed)

  const check = useCallback(
    (requirement?: PermissionRequirement) =>
      hasPermission(requirement, {
        role,
        permissions,
        isSuperAdmin: computed.isSuperAdmin,
        computed,
      }),
    [role, permissions, computed],
  )

  const checkAny = useCallback(
    (reqs: readonly string[]) =>
      hasAnyPermission(reqs, {
        role,
        permissions,
        isSuperAdmin: computed.isSuperAdmin,
        computed,
      }),
    [role, permissions, computed],
  )

  const checkAll = useCallback(
    (reqs: readonly string[]) =>
      hasAllPermissions(reqs, {
        role,
        permissions,
        isSuperAdmin: computed.isSuperAdmin,
        computed,
      }),
    [role, permissions, computed],
  )

  return {
    role,
    permissions,
    computed,
    isSuperAdmin: computed.isSuperAdmin,
    hasPermission: check,
    hasAnyPermission: checkAny,
    hasAllPermissions: checkAll,
  }
}

/**
 * React Hook：响应式判断当前用户是否拥有某项权限。
 */
export function useHasPermission(requirement?: PermissionRequirement): boolean {
  const { hasPermission: check } = usePermission()
  return check(requirement)
}

/**
 * 权限清单的查询选项 —— 直接用契约生成的那一份（它自带 `throwOnError`，
 * 失败会抛给下面的 `ensureUserPermissions`），只覆盖 `staleTime`。
 */
export function userPermissionsQueryOptions() {
  return {
    ...getPermissionsQueryOptions(),
    // 权限不常变：5 分钟内复用，避免每次发消息都打接口
    staleTime: 5 * 60 * 1000,
  }
}

/**
 * React Hook：自动同步后端权限清单至 `usePermissionStore`。
 */
export function useUserPermissions() {
  const query = useQuery(userPermissionsQueryOptions())
  const setPermissions = usePermissionStore((state) => state.setPermissions)

  useEffect(() => {
    if (query.data?.result) {
      setPermissions({
        role: query.data.result.role ?? '',
        permissions: query.data.result.permissions ?? [],
      })
    }
  }, [query.data, setPermissions])

  return query
}

/**
 * 非 React 环境下取权限清单（`chat.ts` / 路由守卫用）—— 没加载过会自动拉一次。
 *
 * **失败时返回空清单**（而不是抛错）：AI 少几个工具是可接受的降级，
 * 因为发消息整条链路不该被一个权限接口拖垮；而**真正的授权在后端**，
 * 空清单只会让 AI 更保守，不会造成越权。
 */
export async function ensureUserPermissions(
  queryClient: QueryClient,
): Promise<UserPermissions> {
  try {
    const data = await queryClient.ensureQueryData(userPermissionsQueryOptions())
    const res = {
      role: data.result?.role ?? '',
      permissions: data.result?.permissions ?? [],
    }
    usePermissionStore.getState().setPermissions(res)
    return res
  } catch {
    return { role: '', permissions: [] }
  }
}
