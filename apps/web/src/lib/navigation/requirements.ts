import { hasPermission, type PermissionContext, type PermissionRequirement } from '#/lib/permissions'
import type { NavGroup } from './types'

/**
 * 权限要求（`feature` / `features` / `permission`）的**唯一解释处**。
 *
 * 名单里三种声明方式并存，语义收敛必须只发生在一个地方 —— 否则侧边栏、
 * 命令面板、外壳导航会各解释一套，「补全 `:*` 通配」这类规则就会分叉。
 */

/**
 * 提取导航节点声明的 feature 或权限要求。
 * 兼容 features / feature / permission 三种声明方式，并对模块简写（如 'table-example'）智能补全为通配模式。
 */
export function getNavFeatureRequirement(target?: {
  features?: string | string[] | PermissionRequirement
  feature?: string | string[] | PermissionRequirement
  permission?: PermissionRequirement
}): PermissionRequirement | undefined {
  const raw = target?.features ?? target?.feature ?? target?.permission
  if (!raw) return undefined

  if (typeof raw === 'string') {
    return raw.includes(':') ? raw : `${raw}:*`
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' && !item.includes(':') ? `${item}:*` : item))
  }

  return raw
}

/**
 * 把权限要求**摊平成逐个权限点**：数组递归展开，其它原样。
 *
 * 为什么需要：`hasPermission` 对数组的语义是 ALL，而组级 / 折叠项级的 `'any'`
 * 判定要的是「任一权限点满足」。摊平不改变 `'all'` 的语义
 * （数组 ALL ≡ 逐个 every），但让 `'any'` 真正可用 —— 否则
 * `features: ['a:read', 'b:read']` 在 any 模式下仍然要求两者都有。
 */
export function flattenPermissionRequirements(
  requirement?: PermissionRequirement,
): PermissionRequirement[] {
  if (!requirement) return []
  if (Array.isArray(requirement)) {
    return requirement.flatMap((item) => flattenPermissionRequirements(item))
  }
  return [requirement]
}

/**
 * 收集一个分组内声明的所有功能/权限要求（已摊平成逐个权限点）。
 * 包括：分组自身 requirements + 所有 items requirements + 所有 sub-items requirements。
 */
export function collectGroupFeatureRequirements(group: NavGroup): PermissionRequirement[] {
  const raw: Array<PermissionRequirement | undefined> = [getNavFeatureRequirement(group)]

  for (const item of group.items) {
    raw.push(getNavFeatureRequirement(item))
    for (const child of item.children ?? []) {
      raw.push(getNavFeatureRequirement(child))
    }
  }

  return raw.flatMap((requirement) => flattenPermissionRequirements(requirement))
}

/**
 * 导航权限命中器 —— 侧边栏、外壳导航、命令面板共用的**唯一**一处。
 *
 * 三个入口各自写一遍 `!item.permission || hasPermission(...)` 就会分叉
 * （漏一处 = 那个入口露出无权项），所以统一从这里出。
 *
 * **内部函数**：不从 `#/lib/navigation` 的入口导出，调用方一律走
 * `filterNavGroups` / `filterShellNavItems` / `filterNavTargets`。
 */
export function createNavRequirementChecker(options?: {
  context?: PermissionContext
  enablePermissionFilter?: boolean
}): (requirement?: PermissionRequirement) => boolean {
  if (options?.enablePermissionFilter === false) return () => true
  return (requirement) => (requirement ? hasPermission(requirement, options?.context) : true)
}
