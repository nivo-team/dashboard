import { Button, Sidebar, useSidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrand } from '#/lib/brand'
import { cn } from '#/lib/cn'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import { filterShellNavItems, MAIN_NAV_ITEMS, SETTINGS_NAV_ITEMS } from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { ShellNavButton, SidebarSearchButton } from '../common/nav-shared'

function MobileSettingsModuleHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const handleBack = () => {
    if (!isMultiAppEnabled()) {
      void navigate({ to: `/${appId}/home` as any })
    } else {
      void navigate({ to: '/' as any })
    }
    setOpenMobile(false)
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

      <span className="min-w-0 flex-1 truncate text-lg font-semibold text-kumo-default">
        {t('profileNav.settings', '设置')}
      </span>
    </div>
  )
}

function MobileSidebarBrandHeader() {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <Sidebar.Header
      className={cn(
        'flex items-center justify-between gap-1.5 px-2 border-b-0',
        'h-[calc(58px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1.5 text-start">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-default">
            <LogoIcon size={20} />
          </span>

          <span className="min-w-0 flex-1 truncate font-semibold text-sm text-kumo-default">
            {brand.shortName}
          </span>
        </div>
      </div>

      <Sidebar.Close />
    </Sidebar.Header>
  )
}

function MobileMainNavItems({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(MAIN_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
    setOpenMobile(false)
  }

  const handleSearch = () => {
    onOpenCommandPalette()
    setOpenMobile(false)
  }

  return (
    <Sidebar>
      <MobileSidebarBrandHeader />

      <Sidebar.Content>
        <SidebarSearchButton onOpen={handleSearch} />

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
    </Sidebar>
  )
}

function MobileSettingsNavItems({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(SETTINGS_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
    setOpenMobile(false)
  }

  const handleSearch = () => {
    onOpenCommandPalette()
    setOpenMobile(false)
  }

  return (
    <Sidebar>
      <MobileSidebarBrandHeader />
      <MobileSettingsModuleHeader />

      <Sidebar.Content>
        <SidebarSearchButton onOpen={handleSearch} />

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
    </Sidebar>
  )
}

/**
 * 移动端通用外壳抽屉侧边栏：
 * 适配顶部安全区与抽屉关闭交互。
 */
export function MobileMainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <MobileSettingsNavItems onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <MobileMainNavItems onOpenCommandPalette={onOpenCommandPalette} />
  )
}
