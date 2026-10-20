import { Outlet } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { HeaderActions } from '#/components/header-actions'
import { PageTabStrip } from '#/components/page-tab-strip'
import { AiPanel } from '#/features/ai/components/panel'
import { DesktopHistoryNav } from './title-bar'
import { cn } from '#/lib/cn'
import { handleDesktopHeaderDoubleClick, useDesktopBlurred, closeDesktopWindow } from './bridge'
import { WindowControls } from './window-controls'
import { useUserPermissions } from '#/lib/permissions'
import { usePreferencesStore } from '#/lib/store'
import { usePageTabsStore } from '#/lib/page-tabs'

/**
 * 桌面壳独立子窗口专用的窗口条：
 * 1. 浮在窗口最顶端，整宽贯穿，左侧物理避让 macOS 原生红绿灯；
 * 2. 红绿灯右侧紧跟前进/后退历史导航 DesktopHistoryNav 与 PageTabStrip 标签条；
 * 3. 右侧工具区按需精简：**仅保留 Ask AI**，支持与用户头像等仅在主窗口展示；
 * 4. 标签条按内容收缩（装不下才横滑），剩下的空白留给窗口拖拽区；整条空白区支持拖拽（drag）与原生双击缩放。
 */
function DesktopStandaloneTitleBar({
  onToggleAskAi,
  isAskAiOpen,
  onOpenCommandPalette,
}: {
  onToggleAskAi: () => void
  isAskAiOpen: boolean
  onOpenCommandPalette: () => void
}) {
  const isBlurred = useDesktopBlurred()
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  return (
    <header
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        'fixed inset-x-0 top-0 z-40 flex h-[var(--shell-chrome-h,40px)] items-center gap-1',
        'border-b-0 select-none drag',
        isBlurred ? 'bg-transparent' : 'bg-kumo-tint',
        'pl-[max(var(--shell-traffic-light-w,0px),0.5rem)] pr-[max(var(--shell-window-controls-w,0px),0.5rem)]',
      )}
    >
      {/* 左侧控制组：红绿灯右侧放置前进/后退历史导航 */}
      <div className="flex shrink-0 items-center drag">
        <DesktopHistoryNav />
      </div>

      {/* 中间自适应标签条（chrome 风格），填满全部剩余可用空间 */}
      <PageTabStrip homeTo="/" variant="chrome" onOpenCommandPalette={onOpenCommandPalette} />


      {/* Windows 的原生拖动区：只有空白申报成 caption（整条申报会吞掉标签与操作区的点击） */}
      <div className="[--wails-non-client-region:caption] min-w-0 flex-1 self-stretch" />

      {/* 右侧精简工具区：仅保留 Ask AI，隐藏支持与用户菜单 */}
      <HeaderActions
        size="sm"
        showAskAi={aiEnabled}
        onAskAi={onToggleAskAi}
        askAiExpanded={isAskAiOpen}
        showSupport={false}
        showUserMenu={false}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      <WindowControls />
    </header>
  )
}

/**
 * 桌面壳独立子窗口布局（对标 VS Code 辅助窗口模式）：
 *
 * 1. 拥有完整的标签页系统（PageTabStrip），支持标签打开、关闭、排序；
 * 2. 支持与主窗口以及其它子窗口互相拖动 Tab 标签流转（按住 Shift 走原生拖拽，见
 *    `#/components/page-tab-item`；不按 Shift 则是窗口内排序）；
 * 3. 顶栏操作区精简：仅包含 Ask AI 助手入口，不含支持和账号菜单；
 * 4. 工作区全高展示，无左侧主导航栏，提供开阔的工作与编辑视界；
 * 5. 支持开合右侧 AI 面板；
 * 6. 若所有标签页均被移出或关闭，子窗口将自动优雅关闭。
 */
export function DesktopStandaloneLayout({ children }: { children?: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiCollapsed, setAiCollapsed] = useState(false)

  // 保证独立窗口下的权限上下文正常就绪
  useUserPermissions()

  const tabs = usePageTabsStore((state) => state.tabs)

  // 监听标签页清空：如果子窗口内所有 Tab 均被关闭或拖走，自动关闭当前子窗口
  useEffect(() => {
    // 延迟检查，避免首屏初次加载阶段触发
    const timer = setTimeout(() => {
      if (tabs.length === 0) {
        void closeDesktopWindow()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tabs.length])

  // ⌘K / Ctrl+K 快捷键支持
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

  const handleToggleAskAi = () => {
    setAiPanelOpen((prev) => !prev)
  }

  return (
    <div
      data-desktop-chrome
      data-desktop-standalone
      className="flex h-svh w-svw flex-col overflow-hidden bg-transparent select-text"
    >
      <DesktopStandaloneTitleBar
        onToggleAskAi={handleToggleAskAi}
        isAskAiOpen={aiPanelOpen}
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />

      {/* 工作区容器：避让顶部 40px 窗口条，内容与 AI 面板之间设置 gap-1 px-2 pb-2 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[var(--shell-chrome-h,40px)]">
        <div className="flex min-h-0 min-w-0 flex-1 gap-1 px-2 pb-2">
          {/* 主内容列：内嵌圆角卡片，承载背景色并透出外层毛玻璃 */}
          <div className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden rounded-lg bg-kumo-canvas shadow-xs">
            <main
              data-shell-content
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6"
            >
              <DetailPreviewProvider>{children ?? <Outlet />}</DetailPreviewProvider>
            </main>
          </div>

          {/* 右侧 AI 助手面板（可由顶栏 Ask AI 开关控制） */}
          <AiPanel
            open={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
            skipEnterAnimation={false}
            collapsed={aiCollapsed}
            onToggleCollapsed={() => setAiCollapsed((v) => !v)}
          />
        </div>
      </div>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
