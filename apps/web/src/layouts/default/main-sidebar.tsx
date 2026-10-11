import { Button, Sidebar, useSidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrand } from '#/lib/brand'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import { filterShellNavItems, MAIN_NAV_ITEMS, SETTINGS_NAV_ITEMS } from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { ShellNavButton, SidebarSearchButton } from '../common/nav-shared'

function DefaultSettingsModuleHeader() {
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

function DefaultSidebarBrandHeader() {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <Sidebar.Header className="flex items-center justify-between gap-1.5 px-2">
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
    </Sidebar.Header>
  )
}

function DefaultMainNavItems({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(MAIN_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
  }

  return (
    <Sidebar>
      <DefaultSidebarBrandHeader />

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

      <Sidebar.Footer className="flex items-center">
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  )
}

function DefaultSettingsNavItems({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(SETTINGS_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    void navigate({ to: to as any })
  }

  return (
    <Sidebar>
      <DefaultSidebarBrandHeader />
      <DefaultSettingsModuleHeader />

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

      <Sidebar.Footer className="flex items-center">
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  )
}

/**
 * Web 通用外壳主侧边栏：
 * 自动根据是否处于设置路由选择通用导航或设置模块导航。
 */
export function DefaultMainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <DefaultSettingsNavItems onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <DefaultMainNavItems onOpenCommandPalette={onOpenCommandPalette} />
  )
}
