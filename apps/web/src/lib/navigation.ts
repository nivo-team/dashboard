import type { Icon } from '@phosphor-icons/react'
import {
  BookBookmarkIcon,
  GearSixIcon,
  HouseIcon,
  InfoIcon,
  ListBulletsIcon,
  ShieldCheckIcon,
  SparkleIcon,
  SquaresFourIcon,
  SwatchesIcon,
  TableIcon,
  TicketIcon,
  TreeStructureIcon,
  UserIcon,
} from '@phosphor-icons/react'
import { isMultiAppEnabled } from './app-config'
import { hasPermission, type PermissionContext, type PermissionRequirement } from './permissions'

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
 * 侧边栏导航配置（唯一数据源）。
 *
 * 约定：导航层级与 `src/routes/$appId/` 下的模块目录一一对应。
 * 一个模块 = 一个目录，模块下的子模块 = 子目录，
 * 因此「示例（/example）→ 表格示例（/example/table）」也是「目录 → 子目录」。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        label: '仪表盘',
        labelKey: 'nav.home',
        to: '/home',
        icon: HouseIcon,
        // 关键词同时覆盖「首页」与「仪表盘」：老用户大概率还在按老名字找它
        keywords: ['home', 'dashboard', 'index', 'start', '首页', '仪表盘', '工作台'],
        badge: 'Beta',
      },
    ],
  },
  {
    // 「示例」模块：承载表格能力的样板页，权限 key 与模块名统一为 `table-example`
    features: 'example:read',
    items: [
      {
        label: '示例',
        labelKey: 'nav.example',
        to: '/example',
        icon: SquaresFourIcon,
        keywords: ['example', 'examples', 'demo', 'table', '示例', '样例', '表格'],
        // 示例模块默认展开，方便新用户一眼看到「表格示例 / 复杂表格」
        defaultOpen: true,
        features: ['example:read'],
        // 两个示例页彼此独立，任一可读就该看到入口（子项各自按权限收敛）
        groupPermissionMode: 'any',
        children: [
          {
            label: '表格示例',
            labelKey: 'nav.tableExample',
            to: '/example/table',
            icon: TableIcon,
            features: 'example:read',
          },
          {
            label: '复杂表格',
            labelKey: 'nav.complexTable',
            to: '/example/complex-table',
            icon: TableIcon,
            features: 'example:read',
          },
          {
            label: '树形表格',
            labelKey: 'nav.treeTable',
            to: '/example/tree-table',
            icon: TreeStructureIcon,
            features: 'example:read',
          },
          {
            label: '工单管理',
            labelKey: 'nav.tickets',
            to: '/example/tickets',
            icon: TicketIcon,
            features: 'example:read',
          },
        ],
      },
    ],
  },
  {
    // 系统管理：与示例同样是折叠分组，模块较多（菜单管理 / 数据字典 / 角色管理）
    features: ['feature:read', 'dict:read', 'role:read'],
    /*
      **显式 'any'**：`/system` 是容器路由，几个子模块（菜单管理 / 数据字典 / 角色管理）
      彼此独立，任一权限就该看到入口 —— 这与 `routes/$appId/system/route.tsx` 的
      `{ any: [...] }` 守卫口径一致。
      若保持默认的 'all'，只有 `dict:read` 的用户能直达 `/system/data-dict`，
      侧边栏却看不到「系统」组 ——「能进页面却找不到入口」。
      组内**子项**仍各自按权限收敛（缺失即隐藏），并不放宽任何实际权限。
    */
    groupPermissionMode: 'any',
    items: [
      {
        label: '系统',
        labelKey: 'nav.system',
        to: '/system',
        icon: GearSixIcon,
        keywords: ['system', 'setting', 'settings', '系统', '系统管理', '配置'],
        defaultOpen: false,
        features: ['feature:read', 'dict:read', 'role:read'],
        // 与所在组同口径：这个折叠项本身就是「系统」模块入口，
        // 各子模块彼此独立，缺一个不该把整项抹掉（子项仍各自按权限收敛）。
        groupPermissionMode: 'any',
        children: [
          {
            label: '菜单管理',
            labelKey: 'nav.systemMenus',
            to: '/system/menus',
            icon: ListBulletsIcon,
            features: 'feature:read',
          },
          {
            label: '数据字典',
            labelKey: 'nav.systemDataDict',
            to: '/system/data-dict',
            icon: BookBookmarkIcon,
            features: 'dict:read',
          },
          {
            label: '角色管理',
            labelKey: 'nav.systemRoles',
            to: '/system/roles',
            icon: ShieldCheckIcon,
            features: 'role:read',
          },
        ],
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*                        命令面板使用的扁平目标列表                          */
/* -------------------------------------------------------------------------- */

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
 * **目录项**（带 `children` 的导航项）的路径集合：示例 `/example`、系统 `/system`。
 *
 * 它们本身是容器 —— 点进去内容就是那几个子页面，所以「开新标签」这类**页面清单**
 * 要把它们摘掉（见 `#/components/page-tab-strip` 的「+」菜单），
 * 列出来只会让人多点一层。侧边栏与命令面板不读它：前者本来要展示分组结构，
 * 后者按「父 · 子」平铺，目录项也是目的地之一。
 */
export const NAV_DIRECTORY_PATHS: ReadonlySet<string> = new Set(
  NAV_GROUPS.flatMap((group) =>
    group.items.filter((item) => item.children?.length).map((item) => item.to),
  ),
)

export const ALL_NAV_TARGETS: NavTarget[] = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => {
    const itemReq = getNavFeatureRequirement(item)
    const self: NavTarget = {
      label: item.label,
      labelKey: item.labelKey,
      to: item.to,
      icon: item.icon,
      keywords: item.keywords ?? [],
      badge: item.badge,
      permission: itemReq,
    }

    const children: NavTarget[] = (item.children ?? []).map((child) => ({
      label: child.label,
      labelKey: child.labelKey,
      parentLabel: item.label,
      parentLabelKey: item.labelKey,
      to: child.to,
      // 二级项没写 `icon` 时回落到父项图标（命令面板与窗口条标签页都读这一个字段）
      icon: child.icon ?? item.icon,
      keywords: [...(item.keywords ?? []), child.label],
      badge: child.badge,
      permission: getNavFeatureRequirement(child) ?? itemReq,
    }))

    return [self, ...children]
  }),
)

/* -------------------------------------------------------------------------- */
/*                      _main 通用外壳的导航（与 appId 无关）                  */
/* -------------------------------------------------------------------------- */

/**
 * 外壳导航项：`to` 是**绝对路径**，不像 `NAV_GROUPS` 那样相对 appId。
 *
 * 为什么单独一套而不是塞进 `NAV_GROUPS`：`AppHeader` 用 `NAV_GROUPS` 的 `to`
 * 做面包屑的最长前缀匹配，外壳路径（`/`、`/settings/profile`）混进去会污染业务面包屑；
 * 而且 `_main` 外壳根本不带 appId 前缀。
 *
 * 侧边栏（`MainSidebar` / `SettingsSidebar`）与命令面板共用这两份数据。
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

/** `_main` 通用外壳的默认侧边栏：多应用模式下显示「应用选择 + 个人资料」，单应用模式下仅显示「个人资料」。 */
const RAW_MAIN_NAV_ITEMS: ShellNavItem[] = [
  {
    label: '应用',
    labelKey: 'profileNav.apps',
    to: '/',
    matchPaths: ['/select-app'],
    icon: SquaresFourIcon,
    keywords: ['app', 'apps', 'workspace', '应用', '工作空间'],
  },
  {
    label: '个人资料',
    labelKey: 'profileNav.myProfile',
    to: '/settings/profile',
    icon: UserIcon,
    keywords: ['profile', 'account', '个人资料', '账号'],
  },
]

export const MAIN_NAV_ITEMS: ShellNavItem[] = isMultiAppEnabled()
  ? RAW_MAIN_NAV_ITEMS
  : RAW_MAIN_NAV_ITEMS.filter((item) => item.to !== '/')

/** 设置模块的二级导航：进入 `/settings/**` 后接管侧边栏。 */
export const SETTINGS_NAV_ITEMS: ShellNavItem[] = [
  {
    label: '个人资料',
    labelKey: 'profileNav.myProfile',
    to: '/settings/profile',
    icon: UserIcon,
    keywords: ['profile', 'account', '个人资料', '账号'],
  },
  {
    label: '外观',
    // 独立 key：导航项叫「外观」（模块入口），而 theme.label 现在指「主题」（主题选择器），
    // 两者语义不同，不要合并
    labelKey: 'profileNav.appearance',
    to: '/settings/appearance',
    icon: SwatchesIcon,
    keywords: ['appearance', 'theme', 'swatches', 'language', 'timezone', '外观', '主题', '偏好'],
  },
  {
    label: 'AI',
    labelKey: 'profileNav.ai',
    // 路径保留大写的 `AI`（缩写）：与导航项显示名一致，URL 里读起来就是「AI 设置」
    to: '/settings/AI',
    icon: SparkleIcon,
    // 与业务导航的「Beta / 内测」标记同一套写法（见 NavItem.badge）
    badge: 'Beta',
    keywords: ['ai', 'ask ai', 'assistant', 'chat', 'sparkle', 'AI', '助手', '人工智能'],
  },
  {
    label: '关于',
    labelKey: 'profileNav.about',
    to: '/settings/about',
    icon: InfoIcon,
    keywords: ['about', 'version', 'tech stack', '关于', '版本', '技术栈'],
  },
]

/** 命令面板用的外壳目标：两份外壳导航合并去重（「个人资料」两处都有）。 */
export const ALL_SHELL_NAV_TARGETS: ShellNavItem[] = [
  ...MAIN_NAV_ITEMS,
  ...SETTINGS_NAV_ITEMS.filter(
    (item) => !MAIN_NAV_ITEMS.some((existing) => existing.to === item.to),
  ),
]

/* -------------------------------------------------------------------------- */
/*                        导航过滤管道与函数                                   */
/* -------------------------------------------------------------------------- */

export type NavItemFilter = (item: NavItem) => boolean
export type NavGroupFilter = (group: NavGroup) => boolean

/**
 * 导航权限命中器 —— 侧边栏、外壳导航、命令面板共用的**唯一**一处。
 *
 * 三个入口各自写一遍 `!item.permission || hasPermission(...)` 就会分叉
 * （漏一处 = 那个入口露出无权项），所以统一从这里出。
 */
function createNavRequirementChecker(options?: {
  context?: PermissionContext
  enablePermissionFilter?: boolean
}): (requirement?: PermissionRequirement) => boolean {
  if (options?.enablePermissionFilter === false) return () => true
  return (requirement) => (requirement ? hasPermission(requirement, options?.context) : true)
}

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
