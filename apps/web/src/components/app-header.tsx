import { useActiveLayout } from '#/layouts/use-active-layout'
import { DefaultAppHeader, type DefaultAppHeaderProps } from '#/layouts/default/header'
import { MobileAppHeader } from '#/layouts/mobile/header'

export type AppHeaderProps = DefaultAppHeaderProps

/**
 * 业务顶栏聚合组件：
 * 移动端呈现带沉浸式安全区与汉堡菜单的 MobileAppHeader，
 * Web 通用环境呈现标准 DefaultAppHeader。
 */
export function AppHeader(props: AppHeaderProps) {
  const layout = useActiveLayout()

  if (layout === 'mobile') {
    return <MobileAppHeader {...props} />
  }

  return <DefaultAppHeader {...props} />
}
