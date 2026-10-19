import type { Icon } from '@phosphor-icons/react'
import type { PermissionContext, PermissionRequirement } from '#/lib/permissions'

/**
 * 导航的数据形状（纯类型，无运行时代码、无数据）。
 *
 * 拆出来的理由：`NavItem` / `NavGroup` / `NavTarget` / `ShellNavItem` 被
 * 「名单数据」「过滤管道」「渲染处」三方共用 —— 放在数据文件里会让
 * 只想引类型的地方（如 `nav-shared.tsx`）连带把整份导航名单拖进依赖图。
 */

/** 二级导航项，渲染为 `Sidebar.MenuSubButton`。 */
export interface NavSubItem {
  label: string
  /** common 命名空间下的文案键；缺失时直接展示 label。 */
  labelKey?: string
  to: string
  /**
   * 图标。**侧边栏的二级项本身不画图标** —— 它是给窗口条的标签页用的
   * （见 `#/lib/page-tabs`）。留空时 `ALL_NAV_TARGETS` 回落到父项图标，
   * 于是同一组下的几个页面在标签条上会长得一模一样（表格示例 / 复杂表格 / 工单管理）。
   */
  icon?: Icon
  badge?: string
  /** 绑定的 feature 或权限要求（如 'example:read' 或 ['example:read'] 或 'table-example'） */
  feature?: string | string[] | PermissionRequirement
  features?: string | string[] | PermissionRequirement
  /** 访问该二级菜单所需的权限要求 */
  permission?: PermissionRequirement
}

/** 顶级导航项，渲染为 `Sidebar.MenuButton`；带 children 时渲染为可折叠分组。 */
export interface NavItem {
  label: string
  /** common 命名空间下的文案键；缺失时直接展示 label。 */
  labelKey?: string
  to: string
  icon: Icon
  /** 命令面板的额外搜索关键词。 */
  keywords?: string[]
  badge?: string
  /** 二级导航。存在时该项会渲染为 `Collapsible` + `MenuSub`。 */
  children?: NavSubItem[]
  /** 折叠分组默认是否展开（配合 children 使用）。 */
  defaultOpen?: boolean
  /** 绑定的 feature 或权限要求 */
  feature?: string | string[] | PermissionRequirement
  features?: string | string[] | PermissionRequirement
  /** 访问该菜单所需的权限要求 */
  permission?: PermissionRequirement
  /**
   * 当包含子项时的组权限判定模式：
   * - 'all'（默认）：必须拥有该组内所有子功能的权限，缺少任一权限则隐藏整个折叠功能组；
   * - 'any'：拥有任一子功能权限即可展示。
   */
  groupPermissionMode?: 'all' | 'any'
}

export interface NavGroup {
  /** 分组标签名；为空时直接展示菜单，不渲染标题。 */
  label?: string
  /** common 命名空间下的分组文案键 */
  labelKey?: string
  items: NavItem[]
  /** 绑定的 feature 或权限要求 */
  feature?: string | string[] | PermissionRequirement
  features?: string | string[] | PermissionRequirement
  /** 分组级别的权限要求 */
  permission?: PermissionRequirement
  /**
   * 组权限判定模式：
   * - 'all'（默认）：用户必须拥有该组内所有功能的权限，缺少任一权限则隐藏整个侧边栏功能组；
   * - 'any'：拥有任一功能权限即可展示。
   */
  groupPermissionMode?: 'all' | 'any'
}

/**
 * 命令面板用的扁平目标（`NAV_GROUPS` 摊平 + 补上「父 · 子」上下文）。
 */
export interface NavTarget {
  /** 兜底展示文案（i18n 键缺失时使用）。 */
  label: string
  /** common 命名空间下的文案键。 */
  labelKey?: string
  /** 二级项所属父级导航的兜底文案与文案键，用于展示「父 · 子」。 */
  parentLabel?: string
  parentLabelKey?: string
  to: string
  icon: Icon
  keywords: string[]
  badge?: string
  permission?: PermissionRequirement
}

/**
 * 外壳导航项：`to` 是**绝对路径**，不像 `NAV_GROUPS` 那样相对 appId。
 *
 * 为什么单独一套而不是塞进 `NAV_GROUPS`：`AppHeader` 用 `NAV_GROUPS` 的 `to`
 * 做面包屑的最长前缀匹配，外壳路径（`/`、`/settings/profile`）混进去会污染业务面包屑；
 * 而且 `_main` 外壳根本不带 appId 前缀。
 */
export interface ShellNavItem {
  label: string
  /** common 命名空间下的文案键；缺失时直接展示 label。 */
  labelKey?: string
  /** 绝对路径。 */
  to: string
  icon: Icon
  /** 额外视为「选中」的路径（如 `/select-app` 是 `/` 的历史别名）。 */
  matchPaths?: string[]
  /** 命令面板的额外搜索关键词。 */
  keywords?: string[]
  /**
   * 名称旁的**状态标记**（如「Beta」「内测」）—— 与 `NavItem.badge` 同一套约定，
   * 渲染用 Kumo 的 `Sidebar.MenuBadge`（自带虚线 pill）。
   *
   * 放配置里而不是渲染处硬编码：侧边栏与命令面板共用同一份数据，标记要跟着数据走。
   */
  badge?: string
  /** 绑定的 feature 或权限要求 */
  features?: string | string[] | PermissionRequirement
  feature?: string | string[] | PermissionRequirement
  /** 权限要求（向下兼容） */
  permission?: PermissionRequirement
}

export type NavItemFilter = (item: NavItem) => boolean
export type NavGroupFilter = (group: NavGroup) => boolean

export interface NavFilterOptions {
  /** 自定义权限上下文（未提供则自动读取当前 store） */
  context?: PermissionContext
  /** 额外的菜单项过滤谓词 */
  itemFilters?: NavItemFilter[]
  /** 额外的分组过滤谓词 */
  groupFilters?: NavGroupFilter[]
  /** 是否启用权限过滤，默认 true */
  enablePermissionFilter?: boolean
}
