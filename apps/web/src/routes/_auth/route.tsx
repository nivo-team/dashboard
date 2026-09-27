import {
  createFileRoute,
  Outlet,
} from '@tanstack/react-router'
import { LocaleSwitcher } from '#/components/locale-switcher'
import { ThemeSwitcher } from '#/components/theme-switcher'

/**
 * 登录门户专用的无前缀布局路由（/_auth/route.tsx）
 * 集中管理右上角悬浮的多语言与系统颜色下拉切换组件
 */
export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="relative min-h-screen w-full bg-kumo-base text-kumo-default">
      {/* 登录页右上角无背景悬浮切换器 */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-end px-6 pointer-events-none sm:px-10">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <LocaleSwitcher className="text-kumo-default lg:text-white lg:hover:bg-white/10 lg:active:bg-white/20" />
          <ThemeSwitcher className="text-kumo-default lg:text-white lg:hover:bg-white/10 lg:active:bg-white/20" />
        </div>
      </header>

      {/* 子页面内容承载区 */}
      <Outlet />
    </div>
  )
}
