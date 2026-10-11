import { Button, Sidebar } from '@cloudflare/kumo'
import { ArrowBendUpLeftIcon } from '@phosphor-icons/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { ShellSidebarProvider } from '#/layouts/provider'
import { DesktopSidebarTrigger, DesktopHistoryNav } from './title-bar'
import { cn } from '#/lib/cn'
import { handleDesktopHeaderDoubleClick, useDesktopBlurred } from './bridge'
import { filterShellNavItems, SETTINGS_NAV_ITEMS } from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { ShellNavButton, SidebarSearchButton } from '#/layouts/common/nav-shared'

/**
 * 桌面独立设置窗口专用的窗口条（无 Tab 模式）：
 * 1. 浮在窗口最顶端，整宽贯穿，左侧物理避让 macOS 原生红绿灯；
 * 2. 红绿灯右侧紧随侧边栏折叠按钮 DesktopSidebarTrigger 与前进/后退历史导航 DesktopHistoryNav；
 * 3. 页面标题绝对居中；
 * 4. 彻底不渲染 PageTabStrip，无 Tab 占用；
 * 5. 全区域支持窗口拖拽（drag）与双击原生最大化/缩放。
 */
function DesktopSettingsTitleBar() {
  const isBlurred = useDesktopBlurred()
  const { t } = useTranslation()

  return (
    <header
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        'fixed inset-x-0 top-0 z-40 flex h-[var(--shell-chrome-h,40px)] items-center justify-between',
        'border-b-0 px-3 select-none drag',
        isBlurred ? 'bg-transparent' : 'bg-kumo-tint',
        'pl-[max(var(--shell-traffic-light-w,0px),0.5rem)] pr-2',
      )}
    >
      {/* 左侧控制组：红绿灯右侧放置侧边栏开关 + 历史前进/后退 */}
      <div className="flex items-center gap-1.5 drag">
        <DesktopSidebarTrigger />
        <DesktopHistoryNav />
      </div>

      {/* 中间：标题绝对居中（pointer-events-none 保证拖拽） */}
      <div className="pointer-events-none absolute inset-x-0 mx-auto flex max-w-[50%] items-center justify-center">
        <span className="truncate text-center text-xs font-medium text-kumo-subtle">
          {t('profileNav.settings', '设置')}
        </span>
      </div>

      {/* 右侧空占位，保持对称且整条空白可拖拽 */}
      <div className="w-16 shrink-0 drag" />
    </header>
  )
}

/**
 * 设置侧边栏模块头：返回按钮 + 模块标题。
 */
function DesktopSettingsModuleHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
    } else {
      void navigate({ to: '/settings/profile' as any })
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
 * 桌面壳设置模块专属侧边栏：
 * 天然不含品牌 Logo，由设置模块行与设置菜单项组成，全高透明。
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
 * 桌面客户端独立 Settings 窗口专用布局：
 *
 * 1. 结构与 App 桌面布局（DesktopShellLayout）完全对齐（全高透明侧边栏 + fixed 窗口条）；
 * 2. 彻底移除 Tabs 标签条，顶栏纯粹展示窗口控制与标题；
 * 3. 工作区内容卡片全高铺满（h-full min-h-0 overflow-y-auto），沉浸展示设置详情；
 * 4. 挂载 DetailPreviewProvider 确保详情预览与 CommandPalette 命令面板正常工作。
 */
export function DesktopSettingsLayout({ children }: { children?: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)

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
    <ShellSidebarProvider>
      <DesktopSettingsSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />

      {/* 工作区：顶部避让 40px 窗口条，内容区整高展示 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[var(--shell-chrome-h,40px)]">
        <div className="flex min-h-0 min-w-0 flex-1 px-2 pb-2">
          <div className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden rounded-lg bg-kumo-canvas">
            <main
              data-shell-content
              className="flex-1 min-h-0 overflow-y-auto px-6 py-6 md:px-8 md:py-7 lg:px-10 lg:py-8"
            >
              <DetailPreviewProvider>{children ?? <Outlet />}</DetailPreviewProvider>
            </main>
          </div>
        </div>
      </div>

      <DesktopSettingsTitleBar />

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </ShellSidebarProvider>
  )
}
