import type { PermissionContext } from '#/lib/permissions'
import {
  collectGroupFeatureRequirements,
  createNavRequirementChecker,
  flattenPermissionRequirements,
  getNavFeatureRequirement,
} from './requirements'
import type { NavFilterOptions, NavGroup, NavItem, NavTarget, ShellNavItem } from './types'

/**
 * 导航的**过滤管道** —— 侧边栏、外壳导航、命令面板在到达渲染前都要过这里。
 *
 * 三个入口共用一个命中器（`createNavRequirementChecker`），所以「给模型看的清单」
 * 与「给人看的清单」用的是同一套判定，不会一个收窄另一个没收。
 * 也正因为这里集中，将来「按权限收窄」只需要改这一处（铁律 4）。
 */

/**
 * 过滤导航分组与菜单项（支持权限过滤、自定义过滤管道与层级修剪）。
 *
 * 规则：
 * 1. 分组或菜单项未通过权限判定时被剔除；
 * 2. 额外传入的自定义谓词全部满足时才保留；
 * 3. 含有 children 的菜单项，若所有子项均被过滤且自身无独立直接路由，则被修剪；
 * 4. 若分组内所有菜单项均被过滤，则该分组整组隐藏。
 */
export function filterNavGroups(
  groups: readonly NavGroup[],
  options?: NavFilterOptions,
): NavGroup[] {
  const enablePerm = options?.enablePermissionFilter ?? true
  const context = options?.context
  const itemFilters = options?.itemFilters ?? []
  const groupFilters = options?.groupFilters ?? []
  const passes = createNavRequirementChecker({
    context,
    enablePermissionFilter: enablePerm,
  })

  const filteredGroups: NavGroup[] = []

  for (const group of groups) {
    // 1. 自定义分组谓词过滤
    if (groupFilters.some((fn) => !fn(group))) {
      continue
    }

    // 2. 组级别权限判定：
    // 若启用了权限过滤，且 groupPermissionMode 默认为 'all'（或指定为 'all'）：
    // 用户必须拥有该组内声明的所有功能权限，若缺少任意一个权限，则隐藏整个侧边栏功能组。
    if (enablePerm) {
      const mode = group.groupPermissionMode ?? 'all'
      if (mode === 'all') {
        const allRequirements = collectGroupFeatureRequirements(group)
        const hasAll = allRequirements.every((req) => passes(req))
        if (!hasAll) {
          continue
        }
      } else {
        // 'any'：组内**任一**权限点满足即可。必须用摊平后的逐个权限点来判 ——
        // 直接对 `features: ['a:read', 'b:read']` 调 `hasPermission` 走的是 ALL 语义。
        const anyRequirements = collectGroupFeatureRequirements(group)
        const hasAny = anyRequirements.some((req) => passes(req))
        if (!hasAny) {
          continue
        }
      }
    }

    // 3. 项级别权限与谓词过滤
    const filteredItems: NavItem[] = []
    for (const item of group.items) {
      if (itemFilters.some((fn) => !fn(item))) {
        continue
      }

      const itemReq = getNavFeatureRequirement(item)

      if (item.children?.length) {
        // 二级子功能菜单：用户没有某一个功能则对应二级菜单隐藏
        const permittedChildren = item.children.filter((child) =>
          passes(getNavFeatureRequirement(child)),
        )

        const passesChildrenRequirement =
          (item.groupPermissionMode ?? 'all') === 'all'
            ? permittedChildren.length === item.children.length
            : permittedChildren.length > 0

        if (passesChildrenRequirement) {
          /*
            折叠项自身的要求：'all' 时整体判定（数组 = ALL）；
            'any' 时必须**摊平后逐个判定** —— 否则 `features: ['a:read','b:read']`
            即便子项已经按 any 收敛，父项这一道仍会因数组走 ALL 而把整项抹掉
            （这正是「只有 dict:read 时系统组整块消失」的根因）。
          */
          const parentReqs = flattenPermissionRequirements(itemReq)
          const isParentPermitted =
            parentReqs.length === 0 ||
            ((item.groupPermissionMode ?? 'all') === 'all'
              ? passes(itemReq)
              : parentReqs.some((requirement) => passes(requirement)))
          if (isParentPermitted) {
            filteredItems.push({
              ...item,
              children: permittedChildren,
            })
          }
        }
      } else {
        // 单项功能菜单：用户没有该功能则隐藏
        if (!passes(itemReq)) {
          continue
        }
        filteredItems.push(item)
      }
    }

    // 若该分组内所有项目均被隐藏，则整组不展示
    if (filteredItems.length > 0) {
      filteredGroups.push({
        ...group,
        items: filteredItems,
      })
    }
  }

  return filteredGroups
}

/**
 * 过滤外壳导航项（支持权限过滤与自定义过滤谓词）。
 */
export function filterShellNavItems(
  items: readonly ShellNavItem[],
  options?: {
    context?: PermissionContext
    filter?: (item: ShellNavItem) => boolean
    enablePermissionFilter?: boolean
  },
): ShellNavItem[] {
  const passes = createNavRequirementChecker(options)
  return items.filter((item) => {
    if (options?.filter && !options.filter(item)) return false
    return passes(getNavFeatureRequirement(item))
  })
}

/**
 * 过滤命令面板的扁平导航目标（`ALL_NAV_TARGETS`）。
 *
 * 与 `filterShellNavItems` 共用 `createNavRequirementChecker` —— 命令面板**不再自己**
 * 写一份 `!item.permission || hasPermission(...)`，否则侧边栏与命令面板会分叉。
 */
export function filterNavTargets(
  targets: readonly NavTarget[],
  options?: {
    context?: PermissionContext
    filter?: (item: NavTarget) => boolean
    enablePermissionFilter?: boolean
  },
): NavTarget[] {
  const passes = createNavRequirementChecker(options)
  return targets.filter((item) => {
    if (options?.filter && !options.filter(item)) return false
    return passes(item.permission)
  })
}
