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
import { MainSidebar } from '#/components/main-sidebar'

function DefaultMainHeader({
  onOpenCommandPalette,
  leading,
}: {
  onOpenCommandPalette: () => void
  leading?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center justify-between border-b border-kumo-line bg-kumo-canvas px-4 select-none">
      {leading}
      <HeaderActions onOpenCommandPalette={onOpenCommandPalette} />
    </header>
  )
}

/**
 * Web 通用版本的通用外壳布局（Default MainLayout）：
 * 承载与具体应用无关的通用功能（应用选择、个人中心与设置），使用标准 Web Flex 布局。
 */
export function DefaultMainLayout({ children }: { children?: React.ReactNode }) {
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
        <MainSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />

        <ShellContentColumn
          desktop={false}
          header={
            <DefaultMainHeader
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
