import { Tooltip } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageTabStrip } from '#/components/page-tab-strip'
import { RouterLink } from '#/components/router-link'
import { useShellSidebarControl } from '#/components/shell-sidebar-provider'
import { useBrand } from '#/lib/brand'
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
 * 桌面壳窗口条左上角的系统品牌 Logo。
 * 位于红绿灯避让区右侧、侧边栏切换按钮左侧，提供稳固的视觉平衡与首页回退能力。
 */
export function DesktopHeaderLogo({ homeTo }: { homeTo: string }) {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <Tooltip
      content={brand.name}
      render={
        <RouterLink
          to={homeTo}
          variant="plain"
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={brand.name}
          className={cn(
            'no-drag relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
            '[color:var(--color-kumo-subtle)]! text-kumo-subtle hover:[color:var(--color-kumo-default)]! hover:text-kumo-default',
            'hover:bg-kumo-base/60 active:bg-kumo-base',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
          )}
        >
          <LogoIcon size={18} className="[color:inherit]! text-inherit shrink-0" />
        </RouterLink>
      }
    />
  )
}

/**
 * 桌面壳窗口条左上角的快速搜索按钮。
 * 位于品牌 Logo 与侧边栏切换按钮之间，点击呼出全局命令面板。
 * 纯中性色样式，携带 ⌘K / Ctrl+K 提示与防穿透保护。
 */
export function DesktopHeaderSearch({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation()
  const label = t('search.quickSearch', '快速搜索…')
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K'

  const handleClick = () => {
    if (onOpen) {
      onOpen()
    } else {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
        }),
      )
    }
  }

  return (
    <Tooltip
      content={`${label} (${shortcutHint})`}
      render={
        <button
          type="button"
          onClick={handleClick}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={cn(
            'no-drag relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-subtle transition-colors',
            'hover:bg-kumo-base/60 hover:text-kumo-default active:bg-kumo-base',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
          )}
        >
          <MagnifyingGlassIcon size={16} className="shrink-0" aria-hidden />
        </button>
      }
    />
  )
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

/**
 * 桌面窗口条 —— 桌面壳里取代顶栏的那一行。
 *
 * 它同时是三件事：
 *
 * 1. **窗口的标题栏与拖拽区**：
 *    拖拽靠 `--wails-draggable: drag`：Wails 只认**鼠标落点那个元素**上的计算值，
 *    而这个自定义属性会继承，所以「条上写 drag、交互区写 no-drag」就能让空白处能拖、
 *    按钮和标签能点。`no-drag` 写在两处：标签条（`PageTabStrip`）与行末工具区。
 *    左侧预留 `ps-[var(--shell-traffic-light-w,78px)]` 避让系统原生红绿灯按钮。
 * 2. **页面标签条**（`PageTabStrip`）：左侧是已打开的页面。
 * 3. **顶栏行末工具区的新位置**：右侧仍是那两个外壳原本的 `HeaderActions`。
 *
 * 高度取 CSS 变量 `--shell-chrome-h`（默认 54px，见 `src/styles.css`）：外壳的整屏几何
 * （侧边栏高度、面板起始位置）都按它算，**改高度只改那一个数**。
 *
 * 双击空白处 = 最大化 / 还原（`handleDesktopHeaderDoubleClick`）。
 * macOS 上这一下由 Wails 自己接管（它的 drag 运行时对可拖拽区的双击直接发系统消息），
 * 所以这里的处理只在 Linux / Windows 生效 —— 不会双重响应。
 *
 * 只在桌面壳里渲染：调用方（两个外壳）用 `isDesktop()` 决定是否挂载 ——
 * 这同时决定了外壳要不要切成「窗口条 + 一行」的纵向结构，两处必须是同一个判断。
 */
export function DesktopTitleBar({
  actions,
  homeTo,
  onOpenCommandPalette,
}: DesktopTitleBarProps) {
  if (!isDesktop()) return null

  const isBlurred = isDesktopBlurredPlatform()

  return (
    <div
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        // 吸顶：内容比一屏高、body 滚动时窗口条留在原地（与原来的 AppHeader 一致）
        'sticky top-0 z-40 flex h-[var(--shell-chrome-h)] shrink-0 items-center gap-1',
        // 底边线用**实色** `--shell-chrome-line`：它是与标签边框 / 倒角圆弧共用的那一支
        'border-b [border-bottom-color:var(--shell-chrome-line)] select-none',
        // 在 macOS 与 Windows 桌面端下为透明（透出原生窗口的毛玻璃模糊）；其他系统保持实体背景 bg-kumo-tint
        isBlurred ? 'bg-transparent' : 'bg-kumo-tint',
        // 左侧预留红绿灯安全边距，右侧保持正常间距
        'ps-[var(--shell-traffic-light-w,78px)] pe-2',
        // 空白处 = 拖拽区，允许拖拽窗口
        'drag',
      )}
    >
      {/* 桌面端品牌 Logo、快速搜索与侧边栏控制组：收纳为独立单元，右侧边框与 Tabs 清晰区隔 */}
      <div className="flex h-full shrink-0 items-center gap-1 border-e [border-inline-end-color:var(--shell-chrome-line)] ps-1.5 pe-2 no-drag">
        <DesktopHeaderLogo homeTo={homeTo} />
        <DesktopHeaderSearch onOpen={onOpenCommandPalette} />
        <DesktopSidebarTrigger />
      </div>

      {/* `chrome`：桌面壳窗口条里那一条是 Chrome 那种连成一片的标签 */}
      <PageTabStrip homeTo={homeTo} variant="chrome" />

      {/* 行末工具区：退出拖拽区，防止拖动窗口，确保内部按钮交互正常 */}
      {actions ? (
        <div className="ms-auto flex shrink-0 items-center gap-2 no-drag">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
