import type { ReactNode } from 'react'
import { NotFound } from '#/components/not-found'
import { DefaultAppLayout, DefaultMainLayout } from './default'
import { DesktopAppLayout, DesktopMainLayout } from './desktop'
import { MobileAppLayout, MobileMainLayout } from './mobile'
import { useActiveLayout } from './use-active-layout'
import type { LayoutVariant } from './types'

export * from './types'
export * from './provider'
export * from './use-active-layout'
export * from './common'

export * as DefaultLayout from './default'
export * as DesktopLayout from './desktop'
export * as MobileLayout from './mobile'

export interface AppShellProps {
  /** 手动指定布局变体；缺省时由当前运行环境自适应决定 */
  variant?: LayoutVariant
}

/**
 * 统一业务外壳布局入口（AppShell / AppLayout）：
 * 依据当前平台自适应分发：
 * - desktop: PC 桌面原生窗口壳（含独立 Sphere 窗口处理）
 * - mobile: 移动端视口与移动原生壳（沉浸式安全区 + 抽屉侧边栏）
 * - default: 标准 Web 浏览器环境
 */
export function AppShell({ variant }: AppShellProps) {
  const activeVariant = useActiveLayout()
  const target = variant ?? activeVariant

  switch (target) {
    case 'desktop':
      return <DesktopAppLayout />
    case 'mobile':
      return <MobileAppLayout />
    case 'default':
    default:
      return <DefaultAppLayout />
  }
}

/** 别名导出 */
export const AppLayout = AppShell

export interface MainLayoutProps {
  /** 手动指定布局变体；缺省时由当前运行环境自适应决定 */
  variant?: LayoutVariant
  children?: ReactNode
}

/**
 * 统一通用外壳布局入口（MainLayout）：
 * 承载与具体应用无关的通用外壳（应用选择、个人中心与设置），
 * 依据当前平台自适应分发：
 * - desktop: DesktopMainLayout
 * - mobile: MobileMainLayout
 * - default: DefaultMainLayout
 */
export function MainLayout({ variant, children }: MainLayoutProps) {
  const activeVariant = useActiveLayout()
  const target = variant ?? activeVariant

  switch (target) {
    case 'desktop':
      return <DesktopMainLayout>{children}</DesktopMainLayout>
    case 'mobile':
      return <MobileMainLayout>{children}</MobileMainLayout>
    case 'default':
    default:
      return <DefaultMainLayout>{children}</DefaultMainLayout>
  }
}

/**
 * 在通用外壳中呈现 404 状态页。
 */
export function MainNotFound() {
  return (
    <MainLayout>
      <NotFound />
    </MainLayout>
  )
}
