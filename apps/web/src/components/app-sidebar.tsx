import { useActiveLayout } from '#/layouts/use-active-layout'
import { DefaultAppSidebar, type DefaultSidebarProps } from '#/layouts/default/sidebar'
import { DesktopAppSidebar } from '#/layouts/desktop/sidebar'
import { MobileAppSidebar } from '#/layouts/mobile/sidebar'

export type AppSidebarProps = DefaultSidebarProps

/**
 * 业务侧边栏聚合组件：
 * 依据当前宿主环境（desktop / mobile / default）自动渲染对应端专享的独立侧边栏实现。
 */
export function AppSidebar(props: AppSidebarProps) {
  const layout = useActiveLayout()

  if (layout === 'desktop') {
    return <DesktopAppSidebar {...props} />
  }

  if (layout === 'mobile') {
    return <MobileAppSidebar {...props} />
  }

  return <DefaultAppSidebar {...props} />
}
