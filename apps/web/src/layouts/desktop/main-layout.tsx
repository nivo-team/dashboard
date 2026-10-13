import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { HeaderActions } from '#/components/header-actions'
import { isStandaloneWindow, isSettingsWindow } from '#/native/bridge'
import { DesktopStandaloneLayout } from '#/native/standalone-layout'
import { DesktopSettingsLayout } from '#/native/settings-layout'
import { cn } from '#/lib/cn'
import { pageContentWidthClass } from '#/lib/page-width'
import { usePreferencesStore } from '#/lib/store'
import { DesktopShellLayout } from './shell-layout'
import { DesktopTitleBar } from './title-bar'
import { MainSidebar } from '#/components/main-sidebar'

/**
 * 桌面壳形态的通用外壳布局（Desktop MainLayout）：
 * 1. 独立极简窗口（isStandaloneWindow()）→ DesktopStandaloneLayout；
 * 2. 独立设置窗口（isSettingsWindow() / 设置路由）→ DesktopSettingsLayout；
 * 3. 桌面壳常规主形态 → 全高透明侧边栏 + fixed 窗口条 DesktopTitleBar。
 */
export function DesktopMainLayout({ children }: { children?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsRoute = pathname === '/settings' || pathname.startsWith('/settings/')

  if (isStandaloneWindow()) {
    return <DesktopStandaloneLayout>{children}</DesktopStandaloneLayout>
  }

  if (isSettingsWindow() || isSettingsRoute) {
    return <DesktopSettingsLayout>{children}</DesktopSettingsLayout>
  }

  return <DesktopMainLayoutStandard>{children}</DesktopMainLayoutStandard>
}

function DesktopMainLayoutStandard({ children }: { children?: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pageWidth = usePreferencesStore((state) => state.pageWidth)

  const desktopHeaderActions = (
    <HeaderActions size="sm" onOpenCommandPalette={() => setPaletteOpen(true)} />
  )

  const mainClassName = cn(
    'px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6',
    pageContentWidthClass(pageWidth),
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <DesktopShellLayout
        sidebar={<MainSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />}
        topBar={
          <DesktopTitleBar
            homeTo="/settings/profile"
            onOpenCommandPalette={() => setPaletteOpen(true)}
            actions={desktopHeaderActions}
          />
        }
        mainClassName={mainClassName}
      >
        {children ?? <Outlet />}
      </DesktopShellLayout>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
