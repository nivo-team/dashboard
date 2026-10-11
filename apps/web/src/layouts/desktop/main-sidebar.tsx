import { Button, Sidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isDesktop, openSettingsWindow } from '#/native/bridge'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import { filterShellNavItems, MAIN_NAV_ITEMS, SETTINGS_NAV_ITEMS } from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { ShellNavButton, SidebarSearchButton } from '../common/nav-shared'

function DesktopSettingsModuleHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const handleBack = () => {
    if (!isMultiAppEnabled()) {
      void navigate({ to: `/${appId}/home` as any })
    } else {
      void navigate({ to: '/' as any })
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
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

function DesktopMainSidebarInternal({
  onOpenCommandPalette,
}: {
  onOpenCommandPalette: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const permissionContext = usePermissionContext()

  const items = useMemo(
    () => filterShellNavItems(MAIN_NAV_ITEMS, { context: permissionContext }),
    [permissionContext],
  )

  const handleNav = (to: string) => {
    if (isDesktop() && (to === '/settings' || to.startsWith('/settings/'))) {
      void openSettingsWindow(to)
      return
    }
    void navigate({ to: to as any })
  }

  return (
    <Sidebar>
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
    </Sidebar>
  )
}

function DesktopSettingsSidebarInternal({
  onOpenCommandPalette,
}: {
  onOpenCommandPalette: () => void
}) {
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
      <DesktopSettingsModuleHeader />

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
    </Sidebar>
  )
}

/**
 * 桌面壳通用外壳侧边栏：
 * 1. 彻底去除品牌名与 Logo，由顶层窗口条统一呈现；
 * 2. `/settings/**` 切换为设置模块侧边栏；
 * 3. 底部不包含 Trigger，由窗口条开关控制。
 */
export function DesktopMainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <DesktopSettingsSidebarInternal onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <DesktopMainSidebarInternal onOpenCommandPalette={onOpenCommandPalette} />
  )
}
