import { DrawerMainSidebar, MainSidebarView } from '#/layouts/common/main-sidebar'
import type { MainSidebarProps } from '#/layouts/common/main-sidebar'
import { SIDEBAR_BY_LAYOUT } from '#/layouts/common/sidebar-variant'
import { useActiveLayout } from '#/layouts/use-active-layout'

export type { MainSidebarProps }

/**
 * 通用外壳（`_main`）主侧边栏聚合组件：按当前宿主环境选出平台变体。
 *
 * 与业务侧边栏（`#/components/app-sidebar`）**共用同一套变体划分**：
 * `default → web`、`mobile → mobile`、`desktop → desktop`，差异是一张表里的一行。
 * 实现只有一份（`#/layouts/common/main-sidebar`）；这里只做「环境 → 变体」映射，
 * 并把桌面端（无 `Sidebar.Provider`）与抽屉式分开渲染。
 */
export function MainSidebar({ onOpenCommandPalette }: MainSidebarProps) {
  const variant = SIDEBAR_BY_LAYOUT[useActiveLayout()]

  if (variant === 'desktop') {
    return <MainSidebarView variant="desktop" onOpenCommandPalette={onOpenCommandPalette} />
  }

  return <DrawerMainSidebar variant={variant} onOpenCommandPalette={onOpenCommandPalette} />
}
