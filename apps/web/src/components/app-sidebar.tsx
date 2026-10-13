import { DrawerAppSidebar, AppSidebarView } from '#/layouts/common/app-sidebar'
import type { AppSidebarProps } from '#/layouts/common/app-sidebar'
import { SIDEBAR_BY_LAYOUT } from '#/layouts/common/sidebar-variant'
import type { SidebarVariant } from '#/layouts/common/sidebar-variant'
import { useActiveLayout } from '#/layouts/use-active-layout'

export type { AppSidebarProps, SidebarVariant }

/**
 * 业务侧边栏聚合组件：按当前宿主环境选出平台变体。
 *
 * | 外壳布局 | 侧边栏变体 | 为什么要分 |
 * | --- | --- | --- |
 * | `default` | `web` | 常规浏览器：可折叠、可拖宽，点导航要收起移动抽屉 |
 * | `mobile` | `mobile` | 移动原生壳 / 窄视口：抽屉式，顶部让出系统状态栏安全区 |
 * | `desktop` | `desktop` | PC 原生窗口：与标题栏融合，**没有** `Sidebar.Provider` |
 *
 * **实现只有一份**（`#/layouts/common/app-sidebar`），差异是那张变体表里的一行；
 * 这里只负责「环境 → 变体」的映射，以及把桌面端与抽屉式分开渲染
 * （桌面端没有 Provider，不能读抽屉状态，见那份文件的注释）。
 */
export function AppSidebar(props: AppSidebarProps) {
  const variant = SIDEBAR_BY_LAYOUT[useActiveLayout()]

  // 桌面端不走抽屉包装：它的外壳没有 Sidebar.Provider
  if (variant === 'desktop') {
    return <AppSidebarView variant="desktop" {...props} />
  }

  return <DrawerAppSidebar variant={variant} {...props} />
}
