import { Button, Sidebar, useSidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { openSettingsWindow } from '#/native/bridge'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import { useBrand } from '#/lib/brand'
import { cn } from '#/lib/cn'
import {
  filterShellNavItems,
  MAIN_NAV_ITEMS,
  SETTINGS_NAV_ITEMS,
  type ShellNavItem,
} from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { ShellNavButton, SidebarSearchButton } from './nav-shared'
import {
  SIDEBAR_DRAWER_HEADER_CLASS,
  SIDEBAR_HEADER_CLASS,
  SIDEBAR_SETTINGS_HEADER_CLASS,
  SIDEBAR_TEXT_COLLAPSE_CLASS,
} from './sidebar-chrome'
import type { SidebarVariant } from './sidebar-variant'

/**
 * 通用外壳（`_main`）主侧边栏 —— **三个平台变体共用的一份实现**。
 *
 * 与业务侧边栏（`./app-sidebar`）同一套路数：渲染逻辑一份，平台差异收敛成变体表。
 * 两个模块的区别只在**内容**（这里是外壳导航：应用 / 个人资料 + 设置模块导航），
 * 而**平台差异是同一批**（顶栏形态、折叠按钮、抽屉开合、折叠态文案）。
 *
 * 内部有两种形态，由路径决定（`/settings/**` 走设置模块导航）：
 * - **主导航**：外壳导航项（`MAIN_NAV_ITEMS`）；
 * - **设置导航**：多一个「返回」模块头（`SETTINGS_NAV_ITEMS`）。
 * 两者共用同一个渲染函数 `ShellNavList`，只有头部与菜单源不同。
 */

export interface MainSidebarProps {
  onOpenCommandPalette: () => void
}

interface MainSidebarTraits {
  /** 顶栏形态：`brand` 品牌头 / `drawer` 品牌头 + 抽屉关闭键（吸顶安全区）/ `none` 不渲染（与窗口条融合） */
  brandHeader: 'brand' | 'drawer' | 'none'
  /** 长文案是否在收起态隐藏（移动抽屉不可折叠，不需要） */
  collapseAwareText: boolean
  /** 设置模块头部是否带下边框（桌面端与窗口条融合，不画线） */
  settingsHeaderBorder: boolean
  /** 底部是否渲染折叠按钮 */
  collapseTrigger: boolean
  /** 点「设置」入口是否改开**原生独立设置窗口**（仅桌面壳，主窗口不被设置打断） */
  settingsInOwnWindow: boolean
}

const MAIN_SIDEBAR_VARIANTS: Record<SidebarVariant, MainSidebarTraits> = {
  web: {
    brandHeader: 'brand',
    collapseAwareText: true,
    settingsHeaderBorder: true,
    collapseTrigger: true,
    settingsInOwnWindow: false,
  },
  mobile: {
    brandHeader: 'drawer',
    collapseAwareText: false,
    settingsHeaderBorder: true,
    collapseTrigger: false,
    settingsInOwnWindow: false,
  },
  desktop: {
    brandHeader: 'none',
    collapseAwareText: true,
    settingsHeaderBorder: false,
    collapseTrigger: false,
    settingsInOwnWindow: true,
  },
}

/** 品牌头：品牌名 + 图标（桌面壳不渲染 —— 由顶层窗口条统一呈现）。 */
function BrandHeader({ variant }: { variant: SidebarVariant }) {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon
  const traits = MAIN_SIDEBAR_VARIANTS[variant]

  return (
    <Sidebar.Header
      className={traits.brandHeader === 'drawer' ? SIDEBAR_DRAWER_HEADER_CLASS : SIDEBAR_HEADER_CLASS}
    >
      <div className="min-w-0 flex-1">
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1.5 text-start">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-default">
            <LogoIcon size={20} />
          </span>

          <span
            className={cn(
              'min-w-0 flex-1 truncate font-semibold text-sm text-kumo-default',
              traits.collapseAwareText && SIDEBAR_TEXT_COLLAPSE_CLASS,
            )}
          >
            {brand.shortName}
          </span>
        </div>
      </div>

      {/* 抽屉形态才有「关掉」这一说 */}
      {traits.brandHeader === 'drawer' ? <Sidebar.Close /> : null}
    </Sidebar.Header>
  )
}

/**
 * 设置模块头部：返回按钮 + 「设置」标题。
 *
 * 返回目标是**部署模式相关**的：单应用直接回该应用首页，多应用回根路径继续选应用。
 */
function SettingsModuleHeader({
  variant,
  onNavigate,
}: {
  variant: SidebarVariant
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const traits = MAIN_SIDEBAR_VARIANTS[variant]

  const handleBack = () => {
    void navigate({ to: (isMultiAppEnabled() ? '/' : `/${appId}/home`) as any })
    onNavigate?.()
  }

  return (
    <div
      className={cn(
        SIDEBAR_SETTINGS_HEADER_CLASS,
        traits.settingsHeaderBorder && 'border-b border-kumo-line',
      )}
    >
      <Button
        shape="square"
        variant="ghost"
        aria-label={t('profileNav.back', '返回')}
        icon={<ArrowBendUpLeftIcon size={16} className="rtl-flip" />}
        onClick={handleBack}
      />

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-lg font-semibold text-kumo-default',
          traits.collapseAwareText && SIDEBAR_TEXT_COLLAPSE_CLASS,
        )}
      >
        {t('profileNav.settings', '设置')}
      </span>
    </div>
  )
}

/** 外壳导航项列表：主导航与设置导航共用（只有菜单源不同）。 */
function ShellNavList({
  items,
  onNavigate,
  onOpenCommandPalette,
}: {
  items: ShellNavItem[]
  onNavigate: (to: string) => void
  onOpenCommandPalette: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const permissionContext = usePermissionContext()

  const visibleItems = useMemo(
    () => filterShellNavItems(items, { context: permissionContext }),
    [items, permissionContext],
  )

  return (
    <Sidebar.Content>
      <SidebarSearchButton onOpen={onOpenCommandPalette} />

      <Sidebar.Group>
        <Sidebar.Menu>
          {visibleItems.map((item) => (
            <ShellNavButton
              key={item.to}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </Sidebar.Menu>
      </Sidebar.Group>
    </Sidebar.Content>
  )
}

export interface MainSidebarViewProps extends MainSidebarProps {
  /** 平台变体（见 `MAIN_SIDEBAR_VARIANTS`）。 */
  variant: SidebarVariant
  /** 点击任何导航项 / 搜索项后触发（抽屉变体用它收起抽屉）。 */
  onItemNavigate?: () => void
}

/**
 * 主侧边栏**纯视图**：不读抽屉状态，所以桌面端（无 `Sidebar.Provider`）也能直接渲染。
 * Web / 移动端请用 `DrawerMainSidebar`。
 */
export function MainSidebarView({
  variant,
  onOpenCommandPalette,
  onItemNavigate,
}: MainSidebarViewProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const traits = MAIN_SIDEBAR_VARIANTS[variant]
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  /*
    桌面壳：从**主导航**点「设置」开独立窗口，不打断主窗口的业务流。
    但设置模块导航本身就长在那个独立窗口里 —— 再开一个窗口会无限套娃，
    所以只在 `!isSettingsSection` 时生效。
  */
  const openSettingsInOwnWindow = traits.settingsInOwnWindow && !isSettingsSection

  const handleNav = useCallback(
    (to: string) => {
      if (openSettingsInOwnWindow && (to === '/settings' || to.startsWith('/settings/'))) {
        void openSettingsWindow(to)
        return
      }
      void navigate({ to: to as any })
      onItemNavigate?.()
    },
    [navigate, onItemNavigate, openSettingsInOwnWindow],
  )

  const handleSearch = useCallback(() => {
    onOpenCommandPalette()
    onItemNavigate?.()
  }, [onOpenCommandPalette, onItemNavigate])

  return (
    <Sidebar>
      {traits.brandHeader !== 'none' ? <BrandHeader variant={variant} /> : null}
      {isSettingsSection ? <SettingsModuleHeader variant={variant} /> : null}

      <ShellNavList
        items={isSettingsSection ? SETTINGS_NAV_ITEMS : MAIN_NAV_ITEMS}
        onNavigate={handleNav}
        onOpenCommandPalette={handleSearch}
      />

      <Sidebar.ResizeHandle />

      {traits.collapseTrigger ? (
        <Sidebar.Footer className="flex items-center">
          <Sidebar.Trigger />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  )
}

/**
 * 抽屉式主侧边栏（Web 单页 + 移动端原生壳共用）：点击导航后收起抽屉。
 *
 * 与 `DrawerAppSidebar` 同理，这一层存在的唯一理由是读 `useSidebar()` ——
 * 桌面端没有 `Sidebar.Provider`，不能把这次读取合进纯视图。
 */
export function DrawerMainSidebar({
  variant,
  ...props
}: Omit<MainSidebarViewProps, 'onItemNavigate'>) {
  const { isMobile, setOpenMobile } = useSidebar()

  const closeDrawer = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  return <MainSidebarView {...props} variant={variant} onItemNavigate={closeDrawer} />
}
