import { Button, Sidebar, useSidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandPaletteDialog } from '#/components/command-palette'
import { HeaderActions } from '#/components/header-actions'
import { PageTabStrip } from '#/components/page-tab-strip'
import { useBrand } from '#/lib/brand'
import { cn } from '#/lib/cn'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import {
  filterShellNavItems,
  MAIN_NAV_ITEMS,
  SETTINGS_NAV_ITEMS,
} from '#/lib/navigation'
import { pageContentWidthClass } from '#/lib/page-width'
import { usePageTabsEnabled } from '#/lib/page-tabs'
import { usePermissionContext } from '#/lib/permissions'
import { usePreferencesStore } from '#/lib/store'
import { BrowserShellLayout } from './browser-shell-layout'
import { ShellNavButton, SidebarSearchButton } from './main-nav-shared'

/**
 * 浏览器端外壳设置模块行：返回上一级 + 模块标题。
 */
function WebSettingsModuleHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const handleBack = () => {
    if (!isMultiAppEnabled()) {
      void navigate({ to: `/${appId}/home` as any })
    } else {
      void navigate({ to: '/' as any })
    }
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-kumo-line px-2 py-1.5">
      <Button
        shape="square"
        variant="ghost"
        aria-label={t('profileNav.back', '返回')}
        icon={<ArrowBendUpLeftIcon size={16} className="rtl-flip" />}
        onClick={handleBack}
      />

      <span className="min-w-0 flex-1 truncate text-lg font-semibold text-kumo-default group-data-[state=collapsed]/sidebar:hidden">
        {t('profileNav.settings', '设置')}
      </span>
    </div>
  )
}

/**
 * 浏览器端两个侧边栏共用的品牌 Header：品牌方块 + 标题，移动端附关闭按钮。
 */
function WebSidebarBrandHeader() {
  const { isMobile } = useSidebar()
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <Sidebar.Header
      className={cn(
        'flex items-center justify-between gap-1.5 px-2',
        isMobile && 'pt-[env(safe-area-inset-top,0px)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1.5 text-start">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-default">
            <LogoIcon size={20} />
          </span>

          <span className="min-w-0 flex-1 truncate font-semibold text-sm text-kumo-default group-data-[state=collapsed]/sidebar:hidden">
            {brand.shortName}
          </span>
        </div>
      </div>

      {isMobile ? <Sidebar.Close /> : null}
    </Sidebar.Header>
  )
}

function WebMainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(MAIN_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar>
      <WebSidebarBrandHeader />

      <Sidebar.Content>
        <SidebarSearchButton onOpen={onOpenCommandPalette} />

        <Sidebar.Group>
          <Sidebar.Menu>
            {items.map((item) => (
              <ShellNavButton
                key={item.to}
                item={item}
                pathname={pathname}
                onNavigate={handleNav}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.ResizeHandle />

      <Sidebar.Footer className="flex items-center group-data-[mobile=true]/sidebar:hidden">
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  )
}

function WebSettingsSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(SETTINGS_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar>
      <WebSidebarBrandHeader />
      <WebSettingsModuleHeader />

      <Sidebar.Content>
        <SidebarSearchButton onOpen={onOpenCommandPalette} />

        <Sidebar.Group>
          <Sidebar.Menu>
            {items.map((item) => (
              <ShellNavButton
                key={item.to}
                item={item}
                pathname={pathname}
                onNavigate={handleNav}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.ResizeHandle />

      <Sidebar.Footer className="flex items-center group-data-[mobile=true]/sidebar:hidden">
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  )
}

function WebMainSidebarSwitch({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <WebSettingsSidebar onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <WebMainSidebar onOpenCommandPalette={onOpenCommandPalette} />
  )
}

function WebMainHeader({
  onOpenCommandPalette,
  leading,
}: {
  onOpenCommandPalette: () => void
  leading?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[calc(58px+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between border-b border-kumo-line bg-kumo-canvas px-3 pt-[env(safe-area-inset-top,0px)] select-none md:px-4">
      {/* 移动端汉堡按钮 */}
      <Sidebar.Trigger className="md:hidden" />

      {leading}

      <HeaderActions onOpenCommandPalette={onOpenCommandPalette} />
    </header>
  )
}

/**
 * 浏览器端外壳布局（MainLayout Web 专用变体）：
 *
 * 1. 结构为一行 flex：侧边栏 │ 内容列（顶栏 WebMainHeader + main）；
 * 2. 侧边栏包含完整的品牌名称与 Logo，底部带折叠 Trigger，支持移动端抽屉；
 * 3. 顶栏包含移动端汉堡按钮与常规尺寸工具区。
 */
export function WebMainLayout({ children }: { children?: React.ReactNode }) {
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

  // ⌘K / Ctrl+K 打开命令面板
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
      <BrowserShellLayout
        sidebar={<WebMainSidebarSwitch onOpenCommandPalette={() => setPaletteOpen(true)} />}
        header={<WebMainHeader leading={headerLeading} onOpenCommandPalette={() => setPaletteOpen(true)} />}
        mainClassName={mainClassName}
      >
        {children ?? <Outlet />}
      </BrowserShellLayout>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
