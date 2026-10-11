import { Sidebar } from '@cloudflare/kumo'
import { Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { HeaderActions } from '#/components/header-actions'
import { PageTabStrip } from '#/components/page-tab-strip'
import { cn } from '#/lib/cn'
import { pageContentWidthClass } from '#/lib/page-width'
import { usePageTabsEnabled } from '#/lib/page-tabs'
import { usePreferencesStore } from '#/lib/store'
import { LayoutSidebarProvider } from '../provider'
import { ShellContentColumn } from '../common/content-column'
import { MobileMainSidebar } from './main-sidebar'

function MobileMainHeader({
  onOpenCommandPalette,
  leading,
}: {
  onOpenCommandPalette: () => void
  leading?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[calc(58px+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between border-b border-kumo-line bg-kumo-canvas px-3 pt-[env(safe-area-inset-top,0px)] select-none">
      <Sidebar.Trigger />

      {leading}

      <HeaderActions onOpenCommandPalette={onOpenCommandPalette} />
    </header>
  )
}

/**
 * 移动端专属通用外壳布局（Mobile MainLayout）：
 * 适配顶部安全区与抽屉侧边栏。
 */
export function MobileMainLayout({ children }: { children?: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pageWidth = usePreferencesStore((state) => state.pageWidth)
  const pageTabsEnabled = usePageTabsEnabled()

  const headerLeading = pageTabsEnabled ? (
    <PageTabStrip homeTo="/settings/profile" onOpenCommandPalette={() => setPaletteOpen(true)} />
  ) : undefined

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
      <LayoutSidebarProvider>
        <MobileMainSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />

        <ShellContentColumn
          desktop={false}
          header={
            <MobileMainHeader
              leading={headerLeading}
              onOpenCommandPalette={() => setPaletteOpen(true)}
            />
          }
          mainClassName={mainClassName}
        >
          {children ?? <Outlet />}
        </ShellContentColumn>
      </LayoutSidebarProvider>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
