import { Outlet } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { DesktopHistoryNav } from './title-bar'
import { cn } from '#/lib/cn'
import { handleDesktopHeaderDoubleClick, useDesktopBlurred } from './bridge'
import { useUserPermissions } from '#/lib/permissions'

/**
 * 超简洁独立窗口专用的窗口条：
 * 1. 浮在窗口最顶端，整宽贯穿，左侧避让 macOS 原生红绿灯；
 * 2. 红绿灯右侧紧跟前进/后退历史导航 DesktopHistoryNav；
 * 3. 页面标题绝对居中；
 * 4. 全条支持窗口拖拽（drag）与双击最大化/还原窗口。
 */
function DesktopStandaloneTitleBar() {
  const isBlurred = useDesktopBlurred()
  const [pageTitle, setPageTitle] = useState(() => (typeof document !== 'undefined' ? document.title : ''))

  useEffect(() => {
    const updateTitle = () => {
      if (typeof document !== 'undefined') {
        setPageTitle(document.title)
      }
    }
    updateTitle()
    const observer = new MutationObserver(updateTitle)
    const titleEl = document.querySelector('title')
    if (titleEl) {
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true })
    }
    return () => observer.disconnect()
  }, [])

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
      {/* 左侧：红绿灯右侧放置前进/后退导航 */}
      <DesktopHistoryNav />

      {/* 中间：标题绝对居中（pointer-events-none 保证拖拽） */}
      <div className="pointer-events-none absolute inset-x-0 mx-auto flex max-w-[50%] items-center justify-center">
        <span className="truncate text-center text-xs font-medium text-kumo-subtle">
          {pageTitle}
        </span>
      </div>

      {/* 右侧空占位，保持对称且整条空白可拖拽 */}
      <div className="w-16 shrink-0 drag" />
    </header>
  )
}

/**
 * 桌面壳超简洁独立子窗口布局：
 *
 * 1. 彻底去除侧边栏（Sidebar）；
 * 2. 彻底去除标签条（Tabs）与全局顶栏；
 * 3. 彻底去除 AI 侧边面板；
 * 4. 仅渲染极简窗口条 DesktopStandaloneTitleBar 与页面内容主体；
 * 5. 挂载 DetailPreviewProvider 确保详情预览功能正常工作。
 */
export function DesktopStandaloneLayout({ children }: { children?: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // 保证独立窗口下的权限上下文正常就绪
  useUserPermissions()

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

  return (
    <div
      data-desktop-chrome
      data-desktop-standalone
      className="flex h-svh w-svw flex-col overflow-hidden bg-kumo-canvas select-text"
    >
      <DesktopStandaloneTitleBar />

      <main
        data-shell-content
        className="flex min-h-0 min-w-0 flex-1 flex-col pt-[var(--shell-chrome-h,40px)] overflow-y-auto"
      >
        <DetailPreviewProvider>
          {children ?? <Outlet />}
        </DetailPreviewProvider>
      </main>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
