import type { ReactNode } from 'react'
import { PageTabStrip } from '#/components/page-tab-strip'
import { cn } from '#/lib/cn'
import { handleDesktopHeaderDoubleClick, isDesktop } from '#/lib/desktop-bridge'

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
export function DesktopTitleBar({ actions, homeTo }: DesktopTitleBarProps) {
  if (!isDesktop()) return null

  return (
    <div
      data-desktop-title-bar
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        // 吸顶：内容比一屏高、body 滚动时窗口条留在原地（与原来的 AppHeader 一致）
        'sticky top-0 z-40 flex h-[var(--shell-chrome-h)] shrink-0 items-center gap-1',
        // 底边线用**实色** `--shell-chrome-line`：它是与标签边框 / 倒角圆弧共用的那一支，
        // 半透明的 `border-kumo-line` 会因为各处底色不同而合成出不同的灰（见 styles.css）
        /*
          底色用 `bg-kumo-tint`（浅色下 97%）而不是 `bg-kumo-canvas`（98.75%）：
          **激活标签（`bg-kumo-base` = 100%）必须比它明显亮**，否则标签那对倒角外侧的
          「月牙」与窗口条只差 2/255 —— 肉眼看不见，倒角就只剩一条悬空的弧线
          （无头 Chrome 实测过：月牙 249 vs 窗口条 251）。Chrome 自己也是这个关系：
          标签条是一道灰一点的长条，激活标签才是白的。
        */
        'border-b [border-bottom-color:var(--shell-chrome-line)] bg-kumo-tint select-none',
        // 左侧预留红绿灯安全边距，右侧保持正常间距
        'ps-[var(--shell-traffic-light-w,78px)] pe-2',
        // 空白处 = 拖拽区，允许拖拽窗口
        'drag',
      )}
    >
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
