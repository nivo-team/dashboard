import { InfoIcon, SparkleIcon, SquaresFourIcon, SwatchesIcon, UserIcon } from '@phosphor-icons/react'
import { isMultiAppEnabled } from '#/lib/app-config'
import type { ShellNavItem } from './types'

/**
 * **_main 通用外壳的导航名单**（与 appId 无关，`to` 是绝对路径）。
 *
 * 与 `./app-nav` 分开的理由见 `ShellNavItem` 的注释（面包屑前缀匹配会被污染、
 * 外壳不带 appId 前缀）。侧边栏、设置二级导航、命令面板、AI 的页面清单共用这两份数据。
 */

/** 外壳默认侧边栏：多应用模式下显示「应用选择 + 个人资料」，单应用模式下仅显示「个人资料」。 */
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

/**
 * 单应用部署下「应用选择」没有意义（只有那一个应用），入口直接摘掉 ——
 * 否则用户点进去只会看到一个只有一项的列表。
 */
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
