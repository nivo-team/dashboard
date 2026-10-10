import { Button, Sidebar, useSidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DesktopTitleBar } from '#/desktop/title-bar'
import { HeaderActions } from '#/components/header-actions'
import { ShortcutKbd } from '#/components/kbd'
import { NotFound } from '#/components/not-found'
import { PageTabStrip } from '#/components/page-tab-strip'
import { ShellSidebarProvider } from '#/components/shell-sidebar-provider'
import { useBrand } from '#/lib/brand'
import { cn } from '#/lib/cn'
import { isDesktop, handleDesktopHeaderDoubleClick } from '#/desktop/bridge'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import {
  filterShellNavItems,
  MAIN_NAV_ITEMS,
  SETTINGS_NAV_ITEMS,
  type ShellNavItem,
} from '#/lib/navigation'
import { pageContentWidthClass } from '#/lib/page-width'
import { usePageTabsEnabled } from '#/lib/page-tabs'
import { usePermissionContext } from '#/lib/permissions'
import { usePreferencesStore } from '#/lib/store'

/** 归一化尾斜杠：`/settings` 与 `/settings/` 是同一个 index 路由，不能因此丢掉高亮。 */
function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

/**
 * 外壳导航项的统一渲染：`_main` 通用导航（应用 / 个人资料）与个人资料二级导航
 * 共用同一份配置对象（`#/lib/navigation` 的 `MAIN_NAV_ITEMS` / `SETTINGS_NAV_ITEMS`），
 * 命令面板也读同一份数据 —— 加导航项只需要改那个文件。
 */
function ShellNavButton({
  item,
  pathname,
  onNavigate,
}: {
  item: ShellNavItem
  pathname: string
  onNavigate: (to: string) => void
}) {
  const { t } = useTranslation()
  const current = normalizePath(pathname)
  const active = (item.matchPaths ?? [item.to]).some((path) => normalizePath(path) === current)
  const label = item.labelKey ? t(item.labelKey, item.label) : item.label

  return (
    <Sidebar.MenuButton
      icon={item.icon}
      tooltip={label}
      itemId={item.to}
      active={active}
      onClick={() => onNavigate(item.to)}
    >
      {/*
        `Sidebar.MenuBadge` 是 Kumo 给侧边栏配的标记：自带虚线 pill + `text-[11px]`，
        并且**紧跟标题**（不加 `ms-auto`）—— 与业务侧边栏的用法保持一致。
      */}
      {label}
      {item.badge ? <Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge> : null}
    </Sidebar.MenuButton>
  )
}

/**
 * 「快速搜索」入口：与 `AppSidebar` 用同一套 Kumo 官方 Sidebar 搜索范式
 * （图标 + 文本 + ⌘K 提示 + ring 描边；折叠态自动收成图标并去掉描边与下边距）。
 */
function SidebarSearchButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const label = t('search.quickSearch', '快速搜索…')

  return (
    <Sidebar.Group>
      <Sidebar.Menu>
        <Sidebar.MenuButton
          icon={MagnifyingGlassIcon}
          tooltip={label}
          onClick={onOpen}
          className="mb-3 ring ring-kumo-line transition-[margin] duration-(--sidebar-animation-duration) group-data-[state=collapsed]/sidebar:mb-0 group-data-[state=collapsed]/sidebar:ring-transparent"
        >
          <span>{label}</span>
          <ShortcutKbd shortcutKey="K" className="group-data-[state=collapsed]/sidebar:hidden" />
        </Sidebar.MenuButton>
      </Sidebar.Menu>
    </Sidebar.Group>
  )
}

/**
 * 设置模块行（参照 Cloudflare 控制台）：返回上一级 + 模块标题。
 * 位置在品牌 Header 之下、滚动内容之上，因此不会跟着菜单滚走。
 */
function SettingsModuleHeader() {
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
 * 两个侧边栏（通用导航 / 设置专属导航）共用的 Header：品牌方块 + 标题，移动端附关闭按钮。
 * 进入设置时它保持不变，变化的是它下面的模块行与菜单。
 */
function SidebarBrandHeader() {
  const { isMobile } = useSidebar()
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <Sidebar.Header className="flex items-center justify-between gap-1.5 px-2">
      <div className="min-w-0 flex-1">
        {/*
          与 AppSwitcher 的触发器用同一套尺寸与排版（p-1.5 / gap-2 / size-7 徽标 /
          font-semibold text-sm 默认行高），保证两套侧边栏顶部完全对齐；
          折叠时标题 hidden 不占位，57px 宽下徽标自然居中。
        */}
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

function MainSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
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
      <SidebarBrandHeader />

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

      {!isDesktop() ? (
        <Sidebar.Footer className="flex items-center group-data-[mobile=true]/sidebar:hidden">
          <Sidebar.Trigger />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  )
}

/**
 * 设置模块专属侧边栏：品牌 Header 与通用导航共用（保持稳定），
 * 在其下方追加模块行（返回 + 标题）与专属菜单 —— 当前是「个人资料 / 设置」两项（`/settings/profile`、`/settings/appearance`）。
 *
 * 这是**同一侧边栏的位置换内容**，不是第二个 Sidebar：
 * `Sidebar.Provider` 不重挂，折叠状态、拖拽宽度与滚动位置都会保留。
 */
function SettingsSidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
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
      <SidebarBrandHeader />
      <SettingsModuleHeader />

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

      {!isDesktop() ? (
        <Sidebar.Footer className="flex items-center group-data-[mobile=true]/sidebar:hidden">
          <Sidebar.Trigger />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  )
}

/**
 * 侧边栏按路由切换：`/settings/**` 用设置专属导航，其余路径用通用导航。
 * 收敛在这一个组件里订阅 pathname，避免 MainLayout（连同内容区）跟着每次路由变化重渲染。
 */
function MainSidebarSwitch({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSettingsSection = pathname === '/settings' || pathname.startsWith('/settings/')

  return isSettingsSection ? (
    <SettingsSidebar onOpenCommandPalette={onOpenCommandPalette} />
  ) : (
    <MainSidebar onOpenCommandPalette={onOpenCommandPalette} />
  )
}

function MainHeader({
  onOpenCommandPalette,
  leading,
}: {
  onOpenCommandPalette: () => void
  /** 行首内容（页面标签条从这里进，见 `AppHeaderProps.leading`）；不给就只剩右侧工具区 */
  leading?: React.ReactNode
}) {
  return (
    <header
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center justify-between border-b border-kumo-line bg-kumo-canvas px-3 select-none md:px-4 drag"
    >
      {/* 移动端汉堡按钮 */}
      <Sidebar.Trigger className="md:hidden no-drag" />

      {leading}

      {/*
        行末工具区：与 AppShell 顶栏共用同一组件（支持 / 账号菜单）。
        `_main` 是没有 appId 的通用外壳，AI 入口与具体应用绑定，这里不显示。
      */}
      <HeaderActions onOpenCommandPalette={onOpenCommandPalette} />
    </header>
  )
}

export function MainLayout({ children }: { children?: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  /**
   * 页面宽度偏好：`full` 铺满、`boxed` 收在 1440px 内居中（`设置 → 外观 → 页面宽度`）。
   * 它是外壳级的显示偏好，只影响下面这个 `<main>`，与路由无关。
   */
  const pageWidth = usePreferencesStore((state) => state.pageWidth)

  /**
   * 桌面壳：窗口条取代 `MainHeader`（与 `AppShell` 同一套换形，理由见那边的注释）。
   *
   * 本外壳没有面包屑，所以窗口条上「左边标签、右边工具区」正好就是原来顶栏的全部内容。
   * 桌面壳下始终由 DesktopTitleBar 承载全部顶层控制，窗口缩小时不渲染冗余顶栏。
   */
  const desktopChrome = isDesktop()
  const showHeader = !desktopChrome
  /** 页面标签页是否生效（桌面壳恒开、浏览器看设置）；见 `usePageTabsEnabled` 与 AppShell 的注释 */
  const pageTabsEnabled = usePageTabsEnabled()

  /**
   * 顶栏行首那一格：本外壳没有面包屑，标签页开着就放标签条（否则整格空着）。
   * 桌面壳里窗口条自己渲染一份，所以这里限定 `!desktopChrome`，两边不同时出现。
   */
  const headerLeading =
    pageTabsEnabled && !desktopChrome ? (
      <PageTabStrip
        homeTo="/settings/profile"
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />
    ) : undefined

  /** 窗口条行末的工具区（`MainHeader` 内部那份同款；两者不会同时在屏幕上，见 `showHeader`） */
  const headerActions = <HeaderActions onOpenCommandPalette={() => setPaletteOpen(true)} />

  // ⌘K / Ctrl+K 打开命令面板（与 AppShell 保持一致的交互）
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
      {/*
        与 AppShell 共用同一个 `ShellSidebarProvider`：侧边栏 UI 偏好（展开态 / 宽度）
        以及「桌面非受控、移动端受控」的移动端抽屉接法都只有一份真值。
        `topBar` 在桌面壳里提供：窗口条整行横跨视口顶部，Main 与侧边栏等均在内部容器中并列。
      */}
      <ShellSidebarProvider
        topBar={
          desktopChrome ? (
            <DesktopTitleBar
              // 标签页全部关掉之后回设置首屏（它是最接近「本外壳首页」的一页）
              homeTo="/settings/profile"
              // 工具区只挂一处：桌面壳里它在窗口条行末，退化出顶栏时（见 showHeader）留给顶栏
              actions={showHeader ? undefined : headerActions}
              onOpenCommandPalette={() => setPaletteOpen(true)}
            />
          ) : null
        }
      >
        <MainSidebarSwitch onOpenCommandPalette={() => setPaletteOpen(true)} />
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col bg-kumo-canvas',
            desktopChrome && 'h-full min-h-0 overflow-hidden',
          )}
        >
          {showHeader ? (
            <MainHeader
              leading={headerLeading}
              actions={headerActions}
              onOpenCommandPalette={() => setPaletteOpen(true)}
            />
          ) : null}
          <main
            data-shell-content
            className={cn(
              'flex-1 px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6',
              // 宽度：full 得到 `w-full`，boxed 再叠上 `mx-auto max-w-[1440px]`
              pageContentWidthClass(pageWidth),
              desktopChrome && 'min-h-0 overflow-y-auto',
            )}
          >
            {children ?? <Outlet />}
          </main>
        </div>
      </ShellSidebarProvider>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}

/**
 * 在 _main 通用外壳中渲染 404 状态页面。
 * 当访问未知的 $appId 时呈现此前台通用外壳，用户仍可正常使用侧边栏与导航回到有效应用。
 */
export function MainNotFound() {
  return (
    <MainLayout>
      <NotFound />
    </MainLayout>
  )
}
