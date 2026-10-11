import { Sidebar, useSidebar } from '@cloudflare/kumo'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isDesktop } from '#/native/bridge'
import {
  persistSidebarOpen,
  persistSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SHELL_MOBILE_BREAKPOINT,
  useShellUiStore,
  type SidebarExpandMode,
} from '#/lib/store'
import { useLocale } from '#/lib/use-locale'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'

export interface ShellSidebarControl {
  /** 侧边栏当前是否处于展开状态（响应式） */
  open: boolean
  /** 切换侧边栏展开/收起 */
  toggleSidebar: () => void
}

const ShellSidebarControlContext = createContext<ShellSidebarControl>({
  open: true,
  toggleSidebar: () => {},
})

/**
 * 访问外壳侧边栏的开合状态与切换动作。
 * 允许窗口标题栏（DesktopTitleBar）等处于 Sidebar.Provider 外部或内部的组件便捷控制侧边栏。
 */
export function useShellSidebarControl(): ShellSidebarControl {
  return useContext(ShellSidebarControlContext)
}

/**
 * 外壳布局共享的 `Sidebar.Provider` 接线。
 *
 * 集中管理桌面端与移动端受控/非受控状态、宽度持久化与多语言 RTL 方向适配。
 */
export function LayoutSidebarProvider({ children }: { children: ReactNode }) {
  const { isRtl } = useLocale()
  const isDesktopShell = isDesktop()
  const isMobile = !isDesktopShell && useIsMobileViewport()
  /** 移动端抽屉的开合：只在内存里（抽屉是「看一眼就走」的浮层，不跨会话保留）。 */
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarOpen = useShellUiStore((state) => state.sidebarOpen)
  const sidebarWidth = useShellUiStore((state) => state.sidebarWidth)
  const sidebarExpandMode = useShellUiStore((state) => state.sidebarExpandMode)

  const toggleSidebarRef = useRef<() => void>(() => {})

  const toggleSidebar = useCallback(() => {
    if (toggleSidebarRef.current) {
      toggleSidebarRef.current()
    } else {
      persistSidebarOpen(!useShellUiStore.getState().sidebarOpen)
    }
  }, [])

  // 桌面端全局快捷键：⌘B（macOS）/ Ctrl+B（Windows / Linux）切换侧边栏展开/收起
  useEffect(() => {
    if (!isDesktop()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement | null
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
          return
        }
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const controlValue = useMemo(
    () => ({
      open: sidebarOpen,
      toggleSidebar,
    }),
    [sidebarOpen, toggleSidebar],
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isMobile) {
        if (!open) blurFocusInsideMobileSidebar()
        setMobileOpen(open)
      }
      persistSidebarOpen(open)
    },
    [isMobile],
  )

  return (
    <ShellSidebarControlContext.Provider value={controlValue}>
      <div
        data-desktop-chrome={isDesktopShell ? '' : undefined}
        className={isDesktopShell ? 'flex h-svh w-svw overflow-hidden' : 'contents'}
      >
        <Sidebar.Provider
          key={isRtl ? 'rtl' : 'ltr'}
          side={isRtl ? 'right' : 'left'}
          collapsible={isDesktopShell ? 'offcanvas' : 'icon'}
          defaultOpen={sidebarOpen}
          open={isMobile ? mobileOpen : undefined}
          onOpenChange={handleOpenChange}
          contained={isDesktopShell}
          mobileBreakpoint={isDesktopShell ? 0 : SHELL_MOBILE_BREAKPOINT}
          peekable={!isDesktopShell}
          resizable
          defaultWidth={sidebarWidth}
          onWidthChange={persistSidebarWidth}
          minWidth={isDesktopShell ? 220 : SIDEBAR_MIN_WIDTH}
          maxWidth={SIDEBAR_MAX_WIDTH}
          className={isDesktopShell ? 'min-h-0 flex-1 overflow-hidden' : undefined}
        >
          <SidebarTriggerBridge toggleRef={toggleSidebarRef} />
          <SidebarPeekBridge expandMode={sidebarExpandMode}>{children}</SidebarPeekBridge>
        </Sidebar.Provider>
      </div>
    </ShellSidebarControlContext.Provider>
  )
}

/** 兼容旧引用的别名导出 */
export const ShellSidebarProvider = LayoutSidebarProvider

function SidebarTriggerBridge({ toggleRef }: { toggleRef: React.MutableRefObject<() => void> }) {
  const { toggleSidebar } = useSidebar()
  useEffect(() => {
    toggleRef.current = toggleSidebar
    return () => {
      toggleRef.current = () => {}
    }
  }, [toggleSidebar, toggleRef])
  return null
}

function SidebarPeekBridge({
  expandMode,
  children,
}: {
  expandMode: SidebarExpandMode
  children: ReactNode
}) {
  const { open, isMobile, startPeek, stopPeek } = useSidebar()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isPeekingFromLogoRef = useRef(false)

  useEffect(() => {
    if (open || isMobile) {
      isPeekingFromLogoRef.current = false
    }
  }, [open, isMobile])

  useEffect(() => {
    if (isMobile || isDesktop()) return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const handlePointerOver = (e: MouseEvent) => {
      if (open) return
      const target = e.target as HTMLElement | null

      if (expandMode === 'none') {
        stopPeek()
        return
      }

      if (expandMode === 'full') {
        return
      }

      const inHeader = Boolean(target?.closest('[data-sidebar="header"]'))
      if (inHeader) {
        isPeekingFromLogoRef.current = true
        startPeek()
      } else if (!isPeekingFromLogoRef.current) {
        stopPeek()
      }
    }

    const handlePointerOut = (e: MouseEvent) => {
      if (open) return
      const related = e.relatedTarget as HTMLElement | null
      const sidebarEl = wrapper.querySelector('[data-sidebar="sidebar"]')

      if (sidebarEl && !sidebarEl.contains(related)) {
        isPeekingFromLogoRef.current = false
        stopPeek()
      }
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target?.closest('a') ||
        target?.closest('[data-sidebar="menu-button"]') ||
        target?.closest('[data-sidebar="menu-sub-button"]')
      ) {
        isPeekingFromLogoRef.current = false
        stopPeek()
      }
    }

    wrapper.addEventListener('mouseover', handlePointerOver)
    wrapper.addEventListener('mouseout', handlePointerOut)
    wrapper.addEventListener('click', handleClick)

    return () => {
      wrapper.removeEventListener('mouseover', handlePointerOver)
      wrapper.removeEventListener('mouseout', handlePointerOut)
      wrapper.removeEventListener('click', handleClick)
    }
  }, [expandMode, isMobile, open, startPeek, stopPeek])

  return (
    <div ref={wrapperRef} className="contents">
      {children}
    </div>
  )
}

function blurFocusInsideMobileSidebar() {
  const focused = document.activeElement
  if (
    focused instanceof HTMLElement &&
    focused.closest('[data-sidebar="sidebar"][data-mobile="true"]')
  ) {
    focused.blur()
  }
}
