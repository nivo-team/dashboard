import {
  BookBookmarkIcon,
  GearSixIcon,
  HouseIcon,
  ListBulletsIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  TableIcon,
  TicketIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react'
import { getNavFeatureRequirement } from './requirements'
import type { NavGroup, NavTarget } from './types'

/**
 * **业务导航名单 —— 全站唯一数据源**（铁律 3）。
 *
 * 约定：导航层级与 `src/routes/$appId/` 下的模块目录一一对应。
 * 一个模块 = 一个目录，模块下的子模块 = 子目录，
 * 因此「示例（/example）→ 表格示例（/example/table）」也是「目录 → 子目录」。
 *
 * `to` 是**相对 appId 的路径**（渲染时才拼 `/${appId}` 前缀）；
 * 外壳路径见 `./shell-nav`。
 *
 * **不要在渲染处再硬编码一份平行的名单** —— 侧边栏、命令面板、窗口条标签页、
 * AI 的页面清单全部从这一份派生。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
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

/** `NAV_GROUPS` 摊平后的命令面板目标清单（父项在前，子项紧随其后）。 */
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
