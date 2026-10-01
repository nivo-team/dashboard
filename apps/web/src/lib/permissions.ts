import type { QueryClient } from '@tanstack/react-query'
import { getPermissionsQueryOptions } from '#/api'
import type { GetPermissionsResponse } from '#/api'

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

/** 权限点匹配：`*` 可通配模块或动作（`*:read` = 任一模块的读权限）。 */
export function matchesPermission(owned: string, pattern: string): boolean {
  if (owned === pattern) return true
  const [ownedModule, ownedAction] = owned.split(':')
  const [patternModule, patternAction] = pattern.split(':')
  return (
    (patternModule === '*' || patternModule === ownedModule) &&
    (patternAction === '*' || patternAction === ownedAction)
  )
}

/** 该用户是否具备某个权限点（支持 `*` 通配）。 */
export function hasPermission(
  permissions: readonly string[],
  pattern: string,
): boolean {
  return permissions.some((owned) => matchesPermission(owned, pattern))
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
 * 非 React 环境下取权限清单（`chat.ts` 用）—— 没加载过会自动拉一次。
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
    // 结构缺失时退回空清单（与接口失败同样是"降级成更保守"）
    return {
      role: data.result?.role ?? '',
      permissions: data.result?.permissions ?? [],
    }
  } catch {
    return { role: '', permissions: [] }
  }
}
