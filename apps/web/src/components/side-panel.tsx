import { cn } from '#/lib/cn'
import type { UsePanelResizeResult } from '#/lib/use-panel-resize'

/**
 * 外壳行尾侧面板共用的「纵向框架」与拖拽手柄。
 *
 * 仓库里有两个这样的面板，观感一致（都是一整列而不是浮在内容里的卡片：无圆角、
 * 无外 padding，与相邻内容之间只留一条 `border-s` 分隔线），**唯一的形态差异是纵向范围**：
 *
 * - `CONTENT_PANEL_FRAME` —— 内容区分屏面板（`#/components/detail-preview` 的 split）：
 *   属于内容区，从**顶栏下沿**开始（58px = 两个 header 的高度），占满视口剩余高度；
 * - `SHELL_PANEL_FRAME` —— 外壳级面板（`#/components/ai-panel`）：与 `Sidebar` **同级**，
 *   整屏高，从视口顶部一直到底部。因此它内部的头行要与 `AppHeader` 同高（58px），
 *   两者的底边线才能连成一条。
 *
 * 写在这里而不是各自文件里：这两个值同时被面板本体与它的拖拽手柄使用，
 * 散在两处迟早会漂移（手柄比面板矮一截、或面板顶到顶栏上面去）。
 */

/** 内容区分屏面板：贴住顶栏下沿，高度取视口剩余部分。 */
export const CONTENT_PANEL_FRAME = 'top-[58px] h-[calc(100svh-58px)]'

/**
 * 外壳级面板：与 `Sidebar` 完全同一套几何（`src/styles.css` 给侧边栏的
 * `sticky / top: 0 / height: 100svh / z-index: 20`），所以它在视觉上与侧边栏一个等级 ——
 * 视口顶端齐平、整屏高、滚动时不动。
 */
export const SHELL_PANEL_FRAME = 'top-0 h-svh'

export interface SidePanelResizeHandleProps {
  /** 可访问名称（如「调整面板宽度」） */
  label: string
  /** `usePanelResize()` 返回的 `handleProps` */
  handleProps: UsePanelResizeResult['handleProps']
  /** 与面板一致的纵向框架（`CONTENT_PANEL_FRAME` / `SHELL_PANEL_FRAME`） */
  frame: string
  /**
   * 额外的类（一般不用传）。
   *
   * **不要在这里传 `ms-*`**：手柄的「占位为 0」正是靠组件内置的 `-ms-1 -me-1`，
   * 而 `cn`（tailwind-merge）会让后出现的 `ms-1` 顶掉它，白缝就又回来了。
   */
  className?: string
}

/**
 * 分屏面板的拖拽手柄。
 *
 * 交互与 Kumo `Sidebar.ResizeHandle` 完全一致（button + pointer 拖拽 + 方向键 / Home / End，
 * 逻辑在 `#/lib/use-panel-resize`）。
 *
 * **`-ms-1 -me-1` 是「面板与内容区严丝合缝」的关键，不要改回正边距**：
 * 手柄宽 8px，两侧各 -4px 负边距 → 它对 flex 布局的**占位恰好为 0**，
 * 于是内容区与面板直接相邻（面板那条 `border-s` 就是两者唯一的分界），
 * 而 8px 的手柄正好以中心骑在这条边框上（一半压在内容区末尾、一半压在面板内），
 * 配合 `z-10` 盖在两者之上 —— hover / 拖动时高亮的就是**边框本身**，
 * 而不是在边框旁边多出一条线。
 * 曾经起始侧用的是 `ms-1`（正边距）：那 4px 会实打实占位，在内容区与面板之间
 * 撑出一条**露底的白缝**（外壳容器本身没有背景，看到的是页面底色），
 * 面板与内容区看起来就不是紧贴的了。
 *
 * 桌面端才有（`hidden md:block`）：窄屏下面板改为覆盖式，没有可拖拽的宽度。
 */
export function SidePanelResizeHandle({
  label,
  handleProps,
  frame,
  className,
}: SidePanelResizeHandleProps) {
  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={label}
      className={cn(
        'group sticky z-10 -ms-1 -me-1 hidden w-2 shrink-0 cursor-col-resize focus:outline-none md:block',
        frame,
        className,
      )}
      {...handleProps}
    >
      {/* 视觉细线只在 hover / 聚焦 / 拖动时出现；`inset-x-0 + mx-auto` 让它居中于手柄（= 面板边框位置），且与书写方向无关 */}
      <span
        aria-hidden
        className="absolute inset-x-0 inset-y-0 mx-auto w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-kumo-hairline group-focus-visible:bg-kumo-hairline group-active:bg-kumo-brand"
      />
    </button>
  )
}
