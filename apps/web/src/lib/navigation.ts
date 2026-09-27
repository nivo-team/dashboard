import type { Icon } from '@phosphor-icons/react'
import {
  GearSixIcon,
  HouseIcon,
  InfoIcon,
  SparkleIcon,
  SquaresFourIcon,
  SwatchesIcon,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react'

/** 二级导航项，渲染为 `Sidebar.MenuSubButton`。 */
export interface NavSubItem {
  label: string
  /** common 命名空间下的文案键；缺失时直接展示 label。 */
  labelKey?: string
  to: string
  badge?: string
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
}

export interface NavGroup {
  /** 分组标签名；为空时直接展示菜单，不渲染标题。 */
  label?: string
  items: NavItem[]
}

/**
 * 侧边栏导航配置（唯一数据源）。
 *
 * 约定：导航层级与 `src/routes/$appId/` 下的模块目录一一对应。
 * 一个模块 = 一个目录，模块下的子模块 = 子目录，
 * 因此「用户运营（/users）→ 用户列表（/users/user）」也是「目录 → 子目录」。
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
        /*
          自定义卡片能力还在演进（卡片种类、指标口径、是否按权限裁剪都没定），
          先用 badge 如实告知用户「这块还会变」。**不加 i18n 键**：
          `badge` 承载的是状态标记而不是导航文案，「Beta」在 7 种语言里都写作 Beta，
          为它维护 7 份相同的 JSON 只有维护成本。
          功能定型（或反过来被砍掉）时记得摘掉这一行。
        */
        badge: 'Beta',
      },
    ],
  },
  {
    // 无分组标题：折叠分组（用户运营）自身已承载分组语义，避免重复的英文 group label
    items: [
      {
        label: '用户运营',
        labelKey: 'nav.userOps',
        to: '/users',
        icon: UsersIcon,
        keywords: ['user', 'users', '用户', '用户运营', 'user ops'],
        // 用户运营后续还会挂载更多子模块，默认折叠，避免侧边栏过长
        defaultOpen: false,
        children: [
          {
            label: '用户列表',
            labelKey: 'nav.userList',
            to: '/users/user',
          },
        ],
      },
    ],
  },
  {
    // 系统管理：与用户运营同样是折叠分组，模块较多（功能 / 部门 / 角色 / 系统用户 / 公告）
    items: [
      {
        label: '系统',
        labelKey: 'nav.system',
        to: '/system',
        icon: GearSixIcon,
        keywords: ['system', 'setting', 'settings', '系统', '系统管理', '配置'],
        defaultOpen: false,
        children: [
          {
            label: '功能',
            labelKey: 'nav.systemFeatures',
            to: '/system/features',
          },
          {
            label: '数据字典',
            labelKey: 'nav.systemDataDict',
            to: '/system/data-dict',
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
}

export const ALL_NAV_TARGETS: NavTarget[] = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => {
    const self: NavTarget = {
      label: item.label,
      labelKey: item.labelKey,
      to: item.to,
      icon: item.icon,
      keywords: item.keywords ?? [],
      badge: item.badge,
    }

    const children: NavTarget[] = (item.children ?? []).map((child) => ({
      label: child.label,
      labelKey: child.labelKey,
      parentLabel: item.label,
      parentLabelKey: item.labelKey,
      to: child.to,
      icon: item.icon,
      keywords: [...(item.keywords ?? []), child.label],
      badge: child.badge,
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
}

/** `_main` 通用外壳的默认侧边栏：应用选择 + 个人资料（进设置模块前的入口）。 */
export const MAIN_NAV_ITEMS: ShellNavItem[] = [
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
    keywords: [
      'appearance',
      'theme',
      'swatches',
      'language',
      'timezone',
      '外观',
      '主题',
      '偏好',
    ],
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
