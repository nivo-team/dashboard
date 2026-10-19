import { cn } from '#/lib/cn'

/**
 * 侧边栏的**外观常量**（只会写一遍的那几串 className）。
 *
 * 这些字符串原本散在 6 个平台变体文件里各抄一份，改一次要改六处 ——
 * 而且它们决定的是「安全区高度」「折叠态描边」这种**平台差异**，
 * 抄错一处不会报错，只会让某个端的顶部差 58px。集中在这里，改一处全端生效。
 */

/**
 * 搜索项：**可折叠**侧边栏用（Web / 桌面端）—— 折叠时收起描边与下边距，
 * 避免图标态下多出一条悬空的分隔线。
 */
export const SIDEBAR_SEARCH_CLASS_FOLDABLE = cn(
  'mb-3 ring ring-kumo-line',
  'transition-[margin] duration-(--sidebar-animation-duration)',
  'group-data-[state=collapsed]/sidebar:mb-0 group-data-[state=collapsed]/sidebar:ring-transparent',
)

/** 搜索项：**不可折叠**侧边栏用（移动抽屉）。 */
export const SIDEBAR_SEARCH_CLASS_PLAIN = 'mb-3 ring ring-kumo-line'

/**
 * 移动端抽屉的顶栏：把 58px 顶栏高度让给系统状态栏安全区（刘海 / 灵动岛），
 * 并抹掉默认下边框 —— 抽屉里的品牌头与导航之间不需要一条横线。
 */
export const SIDEBAR_DRAWER_HEADER_CLASS = cn(
  'flex items-center justify-between gap-1.5 px-2 border-b-0',
  'h-[calc(58px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]',
)

/** 非抽屉变体的顶栏。 */
export const SIDEBAR_HEADER_CLASS = 'flex items-center justify-between gap-1.5 px-2'

/** 「设置」模块头部（返回按钮 + 标题）的公共部分。 */
export const SIDEBAR_SETTINGS_HEADER_CLASS = 'flex shrink-0 items-center gap-1 px-2 py-1.5'

/**
 * 长文案（应用名、模块标题）在**可折叠**侧边栏里要在收起态隐藏：
 * 不隐藏的话，收起成图标条时文字会溢出到内容区。
 */
export const SIDEBAR_TEXT_COLLAPSE_CLASS = 'group-data-[state=collapsed]/sidebar:hidden'
