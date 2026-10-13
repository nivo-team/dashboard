/**
 * 导航模块的**唯一入口**（`#/lib/navigation`）。
 *
 * 拆成目录是因为原本的 `navigation.ts` 混了四件互不相关的事，616 行：
 *
 * | 文件 | 管什么 |
 * | --- | --- |
 * | `types.ts` | 数据形状（纯类型，无运行时代码） |
 * | `requirements.ts` | feature / permission 声明的解释与摊平 |
 * | `app-nav.ts` | **业务导航名单**（相对 appId 路径）—— 铁律 3 的唯一真值 |
 * | `shell-nav.ts` | 外壳导航名单（绝对路径，`_main` 用） |
 * | `filter.ts` | 过滤管道（三个消费入口共用的同一套判定） |
 *
 * 导出面与拆分前**逐字相同**：调用方继续 `import { NAV_GROUPS } from '#/lib/navigation'`。
 * `requirements.ts` 里的 `createNavRequirementChecker` 是内部件，**故意不从这里导出** ——
 * 调用方一律走 `filter*`，避免第四个入口自己拼判定。
 */

export type {
  NavFilterOptions,
  NavGroup,
  NavGroupFilter,
  NavItem,
  NavItemFilter,
  NavSubItem,
  NavTarget,
  ShellNavItem,
} from './types'

export {
  collectGroupFeatureRequirements,
  flattenPermissionRequirements,
  getNavFeatureRequirement,
} from './requirements'

export { ALL_NAV_TARGETS, NAV_DIRECTORY_PATHS, NAV_GROUPS } from './app-nav'

export { ALL_SHELL_NAV_TARGETS, MAIN_NAV_ITEMS, SETTINGS_NAV_ITEMS } from './shell-nav'

export { filterNavGroups, filterNavTargets, filterShellNavItems } from './filter'
