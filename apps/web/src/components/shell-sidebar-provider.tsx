import { Sidebar, useSidebar } from '@cloudflare/kumo'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

/**
 * 两个外壳（`AppShell` / `MainLayout`）共用的 `Sidebar.Provider` 接线。
 *
 * 为什么要有这一层：Provider 的参数与「展开态怎么接」是**外壳级契约**，
 * 各写一份迟早漂移；而移动端抽屉的正确接法恰好藏着一个 Kumo 的坑（见下），
 * 集中在这里才只需要解释一次。
 *
 * ## 移动端必须让 `open` 跟随抽屉
 *
 * Kumo 的 `Sidebar.Provider` 内部是**两套**开合状态：桌面 `open` 与移动 `openMobile`。
 * 但它的 `state`（`expanded` / `collapsed` / `peeking`）只由桌面 `open` 推导：
 *
 * ```js
 * const state = isPeeking ? 'peeking' : open ? 'expanded' : 'collapsed'
 * ```
 *
 * 而 `Sidebar.CollapsibleContent` 用 `isOpen = isCollapsibleOpen && state !== 'collapsed'`
 * 决定二级菜单的可见性（顺带写 `aria-hidden` 与 `inert`）。于是只要用户在**桌面**
 * 折叠过侧边栏（存档里 `sidebarOpen: false`），手机上抽屉虽然能打开，所有二级菜单
 * 却永远是「箭头转了、内容不出来」，且 `inert` 生效后连点都点不进去。
 *
 * 解法：把 Provider 做成**移动端受控** —— Kumo 的 `open` 本来就会同时驱动移动端
 * （`openMobile = isMobile && openProp !== undefined ? openProp : _openMobile`），
 * 于是移动端 `open` 跟着抽屉走，`state` 与抽屉一致，二级菜单恢复。
 *
 * 注意「受控」必须配 `onOpenChange` 回写本地 state，否则抽屉会按不动
 * （这正是 store.md §5.4 警告过的那个坑；差异在于那里说的是「受控 + 不回写」）。
 *
 * 桌面保持**非受控**（`open` 传 `undefined`）：展开态与宽度由 Provider 自己管，
 * 变化经 `onOpenChange` / `onWidthChange` 写回 store，刷新后保持。
 */
export function ShellSidebarProvider({ children }: { children: ReactNode }) {
  const { isRtl } = useLocale()
  const isMobile = useIsMobileViewport()
  /** 移动端抽屉的开合：只在内存里（抽屉是「看一眼就走」的浮层，不跨会话保留）。 */
  const [mobileOpen, setMobileOpen] = useState(false)

  // 桌面初始值：订阅 store 最新状态。
  // 在 RTL / LTR 方向切换时，由于 Kumo 内部 SidebarProvider 的 contextValue 缓存遗漏了 side 依赖，
  // 我们通过 key={isRtl ? 'rtl' : 'ltr'} 触发 Provider 重挂以立即应用正确的 side 定位。
  // 这里读取 store 当前值传给 defaultOpen / defaultWidth，保证方向切换重挂后无缝保持当前的折叠/展开与宽度。
  const sidebarOpen = useShellUiStore((state) => state.sidebarOpen)
  const sidebarWidth = useShellUiStore((state) => state.sidebarWidth)
  const sidebarExpandMode = useShellUiStore((state) => state.sidebarExpandMode)

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // 移动端只更新内存态；persistSidebarOpen 内部还有一道视口判断兜底。
      // 关闭时先把焦点移出抽屉再落状态（见 blurFocusInsideMobileSidebar）——
      // 所有关闭入口（点菜单项 / 汉堡按钮 / 关闭按钮 / Esc / 遮罩）都会经过这里。
      if (isMobile) {
        if (!open) blurFocusInsideMobileSidebar()
        setMobileOpen(open)
      }
      persistSidebarOpen(open)
    },
    [isMobile],
  )

  return (
    <Sidebar.Provider
      key={isRtl ? 'rtl' : 'ltr'}
      side={isRtl ? 'right' : 'left'}
      collapsible="icon"
      // 桌面初始值；移动端受控后 defaultOpen 不参与（`open` 优先）
      defaultOpen={sidebarOpen}
      // 桌面 = undefined（非受控）；移动端 = 抽屉自身的开合
      open={isMobile ? mobileOpen : undefined}
      onOpenChange={handleOpenChange}
      mobileBreakpoint={SHELL_MOBILE_BREAKPOINT}
      // 保持 peekable 开启，使 Kumo context 闭包具备窥探能力；具体展开逻辑由下方的 SidebarPeekBridge 精准控制。
      peekable
      // 允许拖拽右侧边缘调整宽度（见各侧边栏内的 Sidebar.ResizeHandle）。
      resizable
      defaultWidth={sidebarWidth}
      onWidthChange={persistSidebarWidth}
      minWidth={SIDEBAR_MIN_WIDTH}
      maxWidth={SIDEBAR_MAX_WIDTH}
    >
      <SidebarPeekBridge expandMode={sidebarExpandMode}>{children}</SidebarPeekBridge>
    </Sidebar.Provider>
  )
}

/**
 * 侧边栏快速展开方式桥接组件：
 * 处于 Sidebar.Provider 内部，负责处理 `logo`（仅悬浮在 Logo 展开）、`full` 与 `none` 模式。
 */
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

  // 侧边栏常规展开或移动端状态下，重置 Logo 窥探标记
  useEffect(() => {
    if (open || isMobile) {
      isPeekingFromLogoRef.current = false
    }
  }, [open, isMobile])

  useEffect(() => {
    if (isMobile) return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const handlePointerOver = (e: MouseEvent) => {
      if (open) return
      const target = e.target as HTMLElement | null

      // 1. 禁止悬浮展开：鼠标划入任何区域一律阻断 peek 展开
      if (expandMode === 'none') {
        stopPeek()
        return
      }

      // 2. 悬浮展开（full）：交由 Kumo 默认行为自由发挥
      if (expandMode === 'full') {
        return
      }

      // 3. 仅悬浮在 Logo 展开（logo）：
      const inHeader = Boolean(target?.closest('[data-sidebar="header"]'))
      if (inHeader) {
        isPeekingFromLogoRef.current = true
        startPeek()
      } else if (!isPeekingFromLogoRef.current) {
        // 如果当前并非由 Logo 触发的窥探展开，鼠标直接划过菜单项时阻止展开
        stopPeek()
      }
    }

    const handlePointerOut = (e: MouseEvent) => {
      if (open) return
      const related = e.relatedTarget as HTMLElement | null
      const sidebarEl = wrapper.querySelector('[data-sidebar="sidebar"]')

      // 鼠标完全移出侧边栏时收起窥探展开
      if (sidebarEl && !sidebarEl.contains(related)) {
        isPeekingFromLogoRef.current = false
        stopPeek()
      }
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      // 点击了菜单项链接或按钮后收起展开态
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

/**
 * 关闭移动端抽屉前，把焦点从抽屉里移走。
 *
 * Kumo 用 `aria-hidden={!openMobile}` 藏起收起的抽屉。如果关闭那一刻焦点还在抽屉里
 * 的链接上（手机上点二级菜单正是这样：点一下既跳路由、又关抽屉），浏览器会**拒绝应用**
 * 这条 `aria-hidden` 并在控制台告警：
 *
 * > Blocked aria-hidden on an element because its descendant retained focus.
 *
 * 结果是已经收起的导航反而还留在无障碍树里。规范给的做法就是「先移焦点再隐藏」：
 * 把焦点从抽屉里 `blur()` 掉，浏览器随后自然落到 `body` —— 与 Kumo 自己给收起抽屉加的
 * `inert` 生效后的归宿一致，因此没有额外的视觉变化（不会凭空多出一圈焦点环）。
 *
 * 收起的另外两条路径（Esc / 点遮罩）Kumo 自己会把焦点还给汉堡按钮，那之前同样需要
 * 这一下 `blur()`，否则告警一样会出现。
 */
function blurFocusInsideMobileSidebar() {
  const focused = document.activeElement
  if (
    focused instanceof HTMLElement &&
    focused.closest('[data-sidebar="sidebar"][data-mobile="true"]')
  ) {
    focused.blur()
  }
}
