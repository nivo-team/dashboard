import { Tooltip } from '@cloudflare/kumo'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageTabStrip } from '#/components/page-tab-strip'
import { useShellSidebarControl } from '#/components/shell-sidebar-provider'
import { cn } from '#/lib/cn'
import {
  handleDesktopHeaderDoubleClick,
  isDesktop,
  isDesktopBlurredPlatform,
} from '#/lib/desktop-bridge'

export interface DesktopTitleBarProps {
  /**
   * 行末工具区（两个外壳各传自己的 `HeaderActions`）。
   *
   * 桌面壳里它**从顶栏搬到这里**：整个窗口只剩这一行横向 chrome，
   * 于是「顶栏右侧的内容」就是窗口条右侧的内容，不再单独渲染一行顶栏。
   */
  actions?: ReactNode
  /** 标签页全部关掉之后的落点（透传给 `PageTabStrip`）。 */
  homeTo: string
  /** 点击搜索按钮打开全局命令面板 */
  onOpenCommandPalette?: () => void
}

/**
 * 桌面壳窗口条左侧（红绿灯右侧、Tabs 左侧）的侧边栏切换按钮。
 *
 * 采用原生 macOS / 桌面软件经典布局范式：红绿灯紧跟侧边栏开关。
 * 具备 no-drag 防穿透、双击防冒泡、动态状态图标动画及快捷键提示（⌘B / Ctrl+B）。
 */
export function DesktopSidebarTrigger() {
  const { open, toggleSidebar } = useShellSidebarControl()
  const { t } = useTranslation()
  const label = open ? t('sidebar.collapse', '收起侧边栏') : t('sidebar.expand', '展开侧边栏')
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const shortcutHint = isMac ? '⌘B' : 'Ctrl+B'

  return (
    <Tooltip
      content={`${label} (${shortcutHint})`}
      render={
        <button
          type="button"
          onClick={toggleSidebar}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-expanded={open}
          aria-label={label}
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
  )
}

const DESKTOP_HISTORY_MAX_INDEX_KEY = '__desktop_history_max_index__'

function getStoredMaxIndex(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DESKTOP_HISTORY_MAX_INDEX_KEY)
    if (raw !== null) {
      const parsed = parseInt(raw, 10)
      if (!Number.isNaN(parsed)) return parsed
    }
  } catch {
    // 忽略受限环境
  }
  return null
}

function saveStoredMaxIndex(val: number) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DESKTOP_HISTORY_MAX_INDEX_KEY, String(val))
  } catch {
    // 忽略异常
  }
}

/**
 * 桌面壳窗口条的前进/后退导航控制组。
 *
 * 紧随侧边栏切换按钮右侧，直接调用浏览器原生的会话历史记录（window.history.back / forward）。
 * 结合 TanStack Router 历史深度索引与原生 Navigation API 双重判定，在无可前进/后退时自动禁用对应按钮。
 * 附带原生快捷键提示及全局键盘快捷键监听（macOS: ⌘[ / ⌘]；Windows/Linux: Alt+← / Alt+→）。
 */
export function DesktopHistoryNav() {
  const { t } = useTranslation()
  const router = useRouter()
  const currentIndex = useRouterState({
    select: (s) => (s.location.state as any)?.__TSR_index ?? 0,
  })

  // 记录当前会话历史中推入过的最大索引深度（用于判定是否可前进）
  const [maxIndex, setMaxIndex] = useState<number>(() => {
    const stored = getStoredMaxIndex()
    const initial = typeof router !== 'undefined'
      ? ((router.history.location.state as any)?.__TSR_index ?? 0)
      : 0
    return stored !== null ? Math.max(stored, initial) : initial
  })

  // 监听原生 Navigation API（Chromium / Windows WebView2）
  const [navApiState, setNavApiState] = useState<{ canGoBack: boolean; canGoForward: boolean } | null>(() => {
    if (typeof window !== 'undefined' && 'navigation' in window && (window as any).navigation) {
      const nav = (window as any).navigation
      if (typeof nav.canGoBack === 'boolean' && typeof nav.canGoForward === 'boolean') {
        return { canGoBack: nav.canGoBack, canGoForward: nav.canGoForward }
      }
    }
    return null
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !('navigation' in window)) return
    const nav = (window as any).navigation
    if (!nav || typeof nav.addEventListener !== 'function') return

    const update = () => {
      if (typeof nav.canGoBack === 'boolean' && typeof nav.canGoForward === 'boolean') {
        setNavApiState({ canGoBack: nav.canGoBack, canGoForward: nav.canGoForward })
      }
    }

    nav.addEventListener('currententrychange', update)
    return () => nav.removeEventListener('currententrychange', update)
  }, [])

  // 监听 TanStack Router 历史状态机（WebKit / macOS / Linux 深度保障）
  useEffect(() => {
    if (!router?.history?.subscribe) return

    const unsubscribe = router.history.subscribe((opts) => {
      const actionType = opts.action.type
      const nextIndex = (opts.location.state as any)?.__TSR_index ?? 0

      if (actionType === 'PUSH') {
        setMaxIndex(nextIndex)
        saveStoredMaxIndex(nextIndex)
      } else {
        setMaxIndex((prev) => {
          const updated = Math.max(prev, nextIndex)
          saveStoredMaxIndex(updated)
          return updated
        })
      }
    })

    return unsubscribe
  }, [router])

  const canGoBack = navApiState ? navApiState.canGoBack : currentIndex > 0
  const canGoForward = navApiState ? navApiState.canGoForward : currentIndex < maxIndex

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const backShortcut = isMac ? '⌘[' : 'Alt+←'
  const forwardShortcut = isMac ? '⌘]' : 'Alt+→'
  const backLabel = t('navigation.back', '后退')
  const forwardLabel = t('navigation.forward', '前进')

  const handleBack = () => {
    if (!canGoBack) return
    if (typeof window !== 'undefined') window.history.back()
  }

  const handleForward = () => {
    if (!canGoForward) return
    if (typeof window !== 'undefined') window.history.forward()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (isMac) {
        if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          if (e.key === '[' || e.key === 'ArrowLeft') {
            if (!canGoBack) return
            e.preventDefault()
            window.history.back()
          } else if (e.key === ']' || e.key === 'ArrowRight') {
            if (!canGoForward) return
            e.preventDefault()
            window.history.forward()
          }
        }
      } else {
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          if (e.key === 'ArrowLeft') {
            if (!canGoBack) return
            e.preventDefault()
            window.history.back()
          } else if (e.key === 'ArrowRight') {
            if (!canGoForward) return
            e.preventDefault()
            window.history.forward()
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMac, canGoBack, canGoForward])

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip
        content={`${backLabel} (${backShortcut})`}
        render={
          <button
            type="button"
            disabled={!canGoBack}
            onClick={handleBack}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={backLabel}
            aria-disabled={!canGoBack}
            className={cn(
              'no-drag relative flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-subtle transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
              canGoBack
                ? 'cursor-pointer hover:bg-kumo-base/60 hover:text-kumo-default active:bg-kumo-base'
                : 'cursor-not-allowed opacity-35 hover:bg-transparent active:bg-transparent',
            )}
          >
            <ArrowLeftIcon size={16} className="shrink-0 rtl-flip" aria-hidden />
          </button>
        }
      />
      <Tooltip
        content={`${forwardLabel} (${forwardShortcut})`}
        render={
          <button
            type="button"
            disabled={!canGoForward}
            onClick={handleForward}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={forwardLabel}
            aria-disabled={!canGoForward}
            className={cn(
              'no-drag relative flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-subtle transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
              canGoForward
                ? 'cursor-pointer hover:bg-kumo-base/60 hover:text-kumo-default active:bg-kumo-base'
                : 'cursor-not-allowed opacity-35 hover:bg-transparent active:bg-transparent',
            )}
          >
            <ArrowRightIcon size={16} className="shrink-0 rtl-flip" aria-hidden />
          </button>
        }
      />
    </div>
  )
}

/**
 * 桌面壳侧边栏顶部的窗口条 Header。
 *
 * 占据侧边栏全高顶端的 40px 高度（与工作区 DesktopTitleBar 水平对齐）：
 * 1. 左侧预留 macOS 原生红绿灯安全边距（`ps-[var(--shell-traffic-light-w,78px)]`）；
 * 2. 布局与折叠态始终保持一致：红绿灯避让后紧接侧边栏切换按钮与前进/后退历史导航；
 * 3. 具备窗口拖拽区（drag）、双击最大化以及防穿透保护（no-drag / stopPropagation）。
 */
export function DesktopSidebarHeader() {
  if (!isDesktop()) return null

  const isBlurred = isDesktopBlurredPlatform()

  return (
    <div
      data-desktop-sidebar-header
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        'sticky top-0 z-20 flex h-[var(--shell-chrome-h)] shrink-0 items-center gap-1 select-none',
        'border-b [border-bottom-color:var(--shell-chrome-line)]',
        isBlurred ? 'bg-transparent' : 'bg-kumo-base',
        // macOS 红绿灯安全边距
        'ps-[var(--shell-traffic-light-w,78px)] pe-2',
        'drag',
      )}
    >
      <div className="flex h-full shrink-0 items-center gap-1 ps-1 pe-2 no-drag">
        <DesktopSidebarTrigger />
        <DesktopHistoryNav />
      </div>
    </div>
  )
}

/**
 * 桌面窗口条 —— 桌面壳里工作区（Workspace）顶部的标签栏与工具栏。
 *
 * 仅覆盖工作区宽度（位于全高侧边栏右侧）：
 * 1. 展开态：紧贴全高侧边栏垂直分割线，Tabs 从最左侧直接展开，无视觉割裂；
 * 2. 折叠态：动态补齐 macOS 红绿灯边距，并展示展开侧边栏开关与前进/后退导航；
 * 3. 行末承载工具区（HeaderActions）。
 */
export function DesktopTitleBar({
  actions,
  homeTo,
  onOpenCommandPalette,
}: DesktopTitleBarProps) {
  if (!isDesktop()) return null

  const { open } = useShellSidebarControl()
  const isBlurred = isDesktopBlurredPlatform()

  return (
    <div
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        // 吸顶：工作区列顶部
        'sticky top-0 z-40 flex h-[var(--shell-chrome-h)] shrink-0 items-center gap-1',
        // 底边线用实色 --shell-chrome-line
        'border-b [border-bottom-color:var(--shell-chrome-line)] select-none',
        // 毛玻璃下透明
        isBlurred ? 'bg-transparent' : 'bg-kumo-tint',
        // 当侧边栏展开时，红绿灯已在侧边栏避让，此处无需大 padding（ps-1 即可）；
        // 当侧边栏折叠时，动态补齐红绿灯安全边距 ps-[var(--shell-traffic-light-w,78px)]
        open ? 'ps-1 pe-2' : 'ps-[var(--shell-traffic-light-w,78px)] pe-2',
        // 空白处 = 拖拽区，允许拖拽窗口
        'drag',
      )}
    >
      {/* 侧边栏折叠时动态补齐的展开开关与前进/后退导航 */}
      {!open ? (
        <div className="flex h-full shrink-0 items-center gap-1 border-e [border-inline-end-color:var(--shell-chrome-line)] ps-1 pe-2 me-1.5 no-drag">
          <DesktopSidebarTrigger />
          <DesktopHistoryNav />
        </div>
      ) : null}

      {/* `chrome`：桌面壳窗口条里那一条是 Chrome 那种连成一片的标签 */}
      <PageTabStrip
        homeTo={homeTo}
        variant="chrome"
        onOpenCommandPalette={onOpenCommandPalette}
      />

      {/* 行末工具区：退出拖拽区，防止拖动窗口，确保内部按钮交互正常 */}
      {actions ? (
        <div className="ms-auto flex shrink-0 items-center gap-2 no-drag">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
