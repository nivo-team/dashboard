import { Button, Sidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DesktopTitleBar } from '#/desktop/title-bar'
import { DesktopShellLayout } from '#/desktop/shell-layout'
import { HeaderActions } from '#/components/header-actions'
import { cn } from '#/lib/cn'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import {
  filterShellNavItems,
  MAIN_NAV_ITEMS,
  SETTINGS_NAV_ITEMS,
} from '#/lib/navigation'
import { pageContentWidthClass } from '#/lib/page-width'
import { usePermissionContext } from '#/lib/permissions'
import { usePreferencesStore } from '#/lib/store'
import { ShellNavButton, SidebarSearchButton } from './main-nav-shared'

/**
 * 桌面壳设置模块行：返回上一级 + 模块标题。
 * 桌面端整体无底边分隔线，无移动端抽屉逻辑。
 */
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

/**
 * 桌面壳主侧边栏：
 * 1. 彻底去除品牌名与 Logo，顶部避让窗口条后直接由快速搜索和导航承载；
 * 2. 底部不渲染展开/收起 Footer（由桌面窗口条统一控制）；
 * 3. 彻底移除移动端抽屉逻辑。
 */
function DesktopMainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
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
 * 桌面壳设置模块专属侧边栏：
 * 同样去除品牌 Header，直接由模块行（返回 + 设置标题）与设置导航组成。
 */
function DesktopSettingsSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
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
 * 桌面端侧边栏按路由切换：`/settings/**` 用设置专属导航，其余路径用通用导航。
 */
function DesktopMainSidebarSwitch({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <DesktopSettingsSidebar onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <DesktopMainSidebar onOpenCommandPalette={onOpenCommandPalette} />
  )
}

/**
 * 桌面壳形态的通用外壳布局（MainLayout 桌面端专用变体）：
 *
 * 1. 结构为全高透明侧边栏 + 整宽 fixed 浮层窗口条 DesktopTitleBar；
 * 2. 侧边栏插槽使用专有 DesktopMainSidebarSwitch，无品牌 Logo、无移动端抽屉；
 * 3. 窗口条右侧操作区统一为 sm 尺寸；
 * 4. 彻底解耦，不含任何普通浏览器相关的兼容分支。
 */
export function DesktopMainLayout({ children }: { children?: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pageWidth = usePreferencesStore((state) => state.pageWidth)

  const desktopHeaderActions = (
    <HeaderActions size="sm" onOpenCommandPalette={() => setPaletteOpen(true)} />
  )

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
      <DesktopShellLayout
        sidebar={<DesktopMainSidebarSwitch onOpenCommandPalette={() => setPaletteOpen(true)} />}
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
