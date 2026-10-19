import { Tooltip, useSidebar } from '@cloudflare/kumo'
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'
import { useActiveSessionTitle } from '#/features/ai/components/session-picker'
import { useAiSessionStore } from '#/features/ai/core'
import { handleDesktopHeaderDoubleClick } from '#/native/bridge'
import { WindowControls } from '#/native/window-controls'
import { useLocale } from '#/lib/use-locale'
import { cn } from '#/lib/cn'

/**
 * 桌面壳全屏 Sphere 窗口专用的窗口条 Header：
 *
 * 参考主布局（MainLayout / DesktopTitleBar）架构：
 * 1. 浮在窗口最顶端（`fixed inset-x-0 top-0 h-[var(--shell-chrome-h,40px)] z-40`），整宽贯穿；
 * 2. 物理左侧避让 macOS 原生红绿灯（`pl-[max(var(--shell-traffic-light-w,0px),0.5rem)]`）；
 * 3. 只有一个侧边栏控制按钮：始终固定在左侧，折叠和收起状态下位置完全固定不动；
 * 4. 布局重排：红绿灯避让 -> 侧边栏切换按钮 -> AI Bot 形象 -> 标题（“聊天”）；
 * 5. 工作区标题居中：展开侧边栏时自动补偿侧边栏宽度偏移量，使标题永远对齐工作区中轴线；
 * 6. 标题栏无底边 border，全区域默认可拖拽窗口（双击最大化/还原），仅交互按钮退出拖拽。
 */
export function DesktopSphereTitleBar() {
  const { open, toggleSidebar, isResizing } = useSidebar()
  const { isRtl } = useLocale()
  const { t } = useTranslation('ai')
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const activeSessionTitle = useActiveSessionTitle()

  // 快捷键 ⌘B / Ctrl+B 切换侧边栏展开/收起
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement | null
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const segments = pathname.split('/').filter(Boolean)
  const chatId = segments[2] === 'chat' ? segments[3] : undefined
  const routeSession = chatId ? sessions.find((item) => item.id === chatId) : undefined
  const chatTitle = chatId
    ? (routeSession?.title ?? (activeSessionId === chatId ? activeSessionTitle : ''))
    : activeSessionTitle

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const shortcutHint = isMac ? '⌘B' : 'Ctrl+B'
  const toggleLabel = open ? t('sidebarCollapse', '收起侧边栏') : t('sidebarExpand', '展开侧边栏')

  return (
    <header
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        'fixed inset-x-0 top-0 z-40 flex h-[var(--shell-chrome-h,40px)] items-center justify-between',
        'border-b-0 bg-transparent px-3 select-none drag',
        'pl-[max(var(--shell-traffic-light-w,0px),0.5rem)]',
        // 行末让开 Windows 无边框窗口的窗口控制区（其它平台该变量为 0，等价于原来的 px-3）
        'pr-[max(var(--shell-window-controls-w,0px),0.75rem)]',
      )}
    >
      {/*
        左侧固定控制组：无论侧边栏处于展开态还是收起态，
        按钮位置始终严格固定在物理左侧红绿灯旁边，不随侧边栏滑走或跳动
      */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 drag">
        <Tooltip
          content={`${toggleLabel} (${shortcutHint})`}
          className="cursor-pointer"
          render={
            <button
              type="button"
              onClick={toggleSidebar}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-expanded={open}
              aria-label={toggleLabel}
              className={cn(
                'no-drag relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-subtle transition-colors',
                'hover:bg-kumo-base/60 hover:text-kumo-default active:bg-kumo-base',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="shrink-0"
                aria-hidden
              >
                <path d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97" />
                <path
                  d="M6.25 7.25v9.5"
                  className={cn(
                    'transition-transform duration-200 ease-out',
                    open ? 'translate-x-px' : 'translate-x-[10.5px]',
                  )}
                />
              </svg>
            </button>
          }
        />

        {/* AI Bot 形象与标题在切换控制按钮后面 */}
        <AiBotAvatar size={20} className="pointer-events-none shrink-0" />
        <span className="pointer-events-none select-none text-sm font-medium text-kumo-default">
          {t('sphereTitle', '聊天')}
        </span>
      </div>

      {/*
        工作区标题居中容器：
        展开侧边栏时，偏移量加上侧边栏宽度（var(--sidebar-width)），
        使会话标题精准居中在右侧工作区上方，与下方聊天内容和输入框完美中轴对齐；
        收起侧边栏时，平滑回到整屏中央。
      */}
      {chatTitle ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 flex items-center justify-center px-4',
            'transition-[left,right] duration-(--sidebar-animation-duration) ease-(--sidebar-easing)',
            isResizing && 'transition-none!',
          )}
          style={
            isRtl
              ? { left: 0, right: open ? 'var(--sidebar-width)' : 0 }
              : { left: open ? 'var(--sidebar-width)' : 0, right: 0 }
          }
        >
          <span className="max-w-[50%] truncate text-center text-sm font-medium text-kumo-subtle">
            {chatTitle}
          </span>
        </div>
      ) : null}

      {/* 右侧空占位：保持对称，同时是 Windows 的原生拖动区（caption） */}
      <div className="[--wails-non-client-region:caption] w-10 shrink-0 drag" />

      <WindowControls />
    </header>
  )
}
