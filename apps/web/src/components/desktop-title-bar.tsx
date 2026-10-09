import type { MouseEvent, ReactNode } from 'react'
import { PageTabStrip } from '#/components/page-tab-strip'
import { cn } from '#/lib/cn'
import { call, isDesktop } from '#/lib/desktop-bridge'

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
}

/**
 * 桌面窗口条 —— 桌面壳里取代顶栏的那一行。
 *
 * 它同时是三件事：
 *
 * 1. **窗口的标题栏与拖拽区**（壳把窗口设成 frameless，系统标题栏没了）。
 *    拖拽靠 `--wails-draggable: drag`：Wails 只认**鼠标落点那个元素**上的计算值，
 *    而这个自定义属性会继承，所以「条上写 drag、交互区写 no-drag」就能让空白处能拖、
 *    按钮和标签能点。`no-drag` 写在两处：标签条（`PageTabStrip`）与行末工具区。
 * 2. **页面标签条**（`PageTabStrip`）：左侧是已打开的页面。
 * 3. **顶栏行末工具区的新位置**：右侧仍是那两个外壳原本的 `HeaderActions`。
 *
 * 高度取 CSS 变量 `--shell-chrome-h`（见 `src/styles.css`）：外壳的整屏几何
 * （侧边栏高度、面板起始位置）都按它算，**改高度只改那一个数**。
 *
 * 双击空白处 = 最大化 / 还原（`window.toggleMaximise`，见 `apps/desktop/README.md`）。
 * macOS 上这一下由 Wails 自己接管（它的 drag 运行时对可拖拽区的双击直接发系统消息），
 * 所以这里的处理只在 Linux / Windows 生效 —— 不会双重响应。
 *
 * 只在桌面壳里渲染：调用方（两个外壳）用 `isDesktop()` 决定是否挂载 ——
 * 这同时决定了外壳要不要切成「窗口条 + 一行」的纵向结构，两处必须是同一个判断。
 */
export function DesktopTitleBar({ actions, homeTo }: DesktopTitleBarProps) {
  if (!isDesktop()) return null

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    // 落在标签 / 按钮 / 菜单上的双击不抢：那是它们自己的交互区
    if ((event.target as HTMLElement).closest('button, a, input, [role="menu"]')) return
    void call('window.toggleMaximise').catch(() => {
      /* 壳没实现该方法时静默忽略：窗口条本身仍然可用 */
    })
  }

  return (
    <div
      data-desktop-title-bar
      onDoubleClick={handleDoubleClick}
      className={cn(
        // 吸顶：内容比一屏高、body 滚动时窗口条留在原地（与原来的 AppHeader 一致）
        'sticky top-0 z-40 flex h-[var(--shell-chrome-h)] shrink-0 items-center gap-1',
        'border-b border-kumo-line bg-kumo-canvas px-2 select-none',
        // 空白处 = 拖拽区（窗口是 frameless 的，没有系统标题栏可拖）
        '[--wails-draggable:drag]',
      )}
    >
      <PageTabStrip homeTo={homeTo} />

      {/* 行末工具区：退出拖拽区，否则按钮点不动 */}
      {actions ? (
        <div className="ms-auto flex shrink-0 items-center gap-2 [--wails-draggable:no-drag]">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
