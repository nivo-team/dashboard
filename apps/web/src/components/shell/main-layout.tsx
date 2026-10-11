import { isDesktop, isStandaloneWindow, isSettingsWindow } from '#/desktop/bridge'
import { DesktopStandaloneLayout } from '#/desktop/standalone-layout'
import { DesktopSettingsLayout } from '#/desktop/settings-layout'
import { NotFound } from '#/components/not-found'
import { useRouterState } from '@tanstack/react-router'
import { DesktopMainLayout } from './desktop-main-layout'
import { WebMainLayout } from './web-main-layout'

/**
 * 通用外壳（`_main` 路由，包括应用选择、个人中心与系统设置）：
 *
 * 采用与 Sphere 相同的变体拆分架构（`SphereLayout` → `DesktopSphereLayout` / `WebSphereLayout`）：
 * - 独立极简窗口（`isStandaloneWindow()`）→ `DesktopStandaloneLayout`（无侧边栏、无标签条，仅页面内容）；
 * - 独立设置窗口（`isSettingsWindow()` / 设置路由）→ `DesktopSettingsLayout`（无 Tab 模式、侧边栏 + 内容全高）；
 * - 桌面壳常规主形态（`isDesktop()`）→ `DesktopMainLayout`（全高透明侧边栏 + fixed 窗口条）；
 * - 浏览器形态 → `WebMainLayout`（常规 flex 一行布局，包含完整品牌 Logo、移动端抽屉与顶栏）。
 *
 * 本入口只负责按环境分派变体，两侧物理隔离、各司其职，彻底避免通用组件内杂揉 `isDesktop()` 判断。
 */
export function MainLayout({ children }: { children?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsRoute = pathname === '/settings' || pathname.startsWith('/settings/')

  if (isStandaloneWindow()) {
    return <DesktopStandaloneLayout>{children}</DesktopStandaloneLayout>
  }

  if (isDesktop()) {
    if (isSettingsWindow() || isSettingsRoute) {
      return <DesktopSettingsLayout>{children}</DesktopSettingsLayout>
    }
    return <DesktopMainLayout>{children}</DesktopMainLayout>
  }

  return <WebMainLayout>{children}</WebMainLayout>
}

/**
 * 在 `_main` 通用外壳中渲染 404 状态页面。
 * 当访问未知的 `$appId` 时呈现此前台通用外壳，用户仍可正常使用侧边栏与导航回到有效应用。
 */
export function MainNotFound() {
  return (
    <MainLayout>
      <NotFound />
    </MainLayout>
  )
}
