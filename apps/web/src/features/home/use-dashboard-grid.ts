import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  clampWidgetWidth,
  clampWidgetX,
  getGridMetrics,
  snapHeight,
  stepHeight,
} from '#/lib/dashboard-constants'
import { compactLayout, type DashboardWidget } from '#/lib/dashboard-layout'

/**
 * 仪表盘的拖动 / 缩放交互（**零依赖手写**）。
 *
 * 为什么不用 react-grid-layout 这类库，见 `.agents/docs/dashboard-module.md` 的选型说明；
 * 这里只记实现上的几个要点：
 *
 * 1. **拖动期间不落盘**：指针移动时只更新本地 `preview` 布局（每帧一次，
 *    包含一次 O(n²) 的压缩），松手才 `onCommit` 一次。否则每次 pointermove
 *    都会写 localStorage（一秒钟几十次），既卡又会产生大量无意义的写入。
 * 2. **位移永远相对「按下时的起点」算**，而不是相对上一帧累加 ——
 *    累加会把每帧的取整误差叠起来，拖久了卡片会漂。
 * 3. **列方向要乘 RTL 系数**：`grid-column-start` 在 RTL 下从右往左数，
 *    指针往右移动对应的是列号**减小**。少了这一步，阿拉伯语环境下拖动会反向。
 * 4. **指针事件挂在 window 上**（而不是手柄自己）：指针很容易滑出那颗 24px 的按钮，
 *    挂在自己身上会在滑出瞬间丢失后续事件。`pointercancel`（触摸被系统打断）
 *    与 `pointerup` 一样收尾，否则会留下一个卡住的 `activeId`。
 */
export type GridDragMode = 'move' | 'resize'

interface DragSession {
  id: string
  mode: GridDragMode
  /** 按下时的指针坐标（clientX / clientY）。 */
  pointerX: number
  pointerY: number
  /** 按下时该卡片的位置与尺寸（位移的基准）。 */
  origin: { x: number; y: number; w: number; h: number }
  columnStep: number
  rowStep: number
  /** RTL 时列方向取反。 */
  direction: 1 | -1
  /** 本帧算出的布局，松手时提交它（没动过则为 null）。 */
  latest: DashboardWidget[] | null
}

interface UseDashboardGridOptions {
  /** 已提交的布局。 */
  widgets: DashboardWidget[]
  /** 是否允许交互（自定义模式 && 非移动端）。 */
  enabled: boolean
  /** 松手 / 键盘调整后提交一次。 */
  onCommit: (next: DashboardWidget[]) => void
}

export function useDashboardGrid({ widgets, enabled, onCommit }: UseDashboardGridOptions) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<DragSession | null>(null)
  /** 事件回调里读最新的已提交布局（拖拽回调只在按下时创建一次，不能闭包捕获旧值）。 */
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets

  const [preview, setPreview] = useState<DashboardWidget[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  /** 拖动 / 缩放期间用预览布局，平时用已提交布局。 */
  const layout = preview ?? widgets

  /** 量一次容器：列步长 / 行步长 / 书写方向。 */
  const measure = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const metrics = getGridMetrics(rect.width)
    const rtl = typeof window !== 'undefined' && window.getComputedStyle(grid).direction === 'rtl'
    return { columnStep: metrics.columnStep, rowStep: metrics.rowStep, rtl }
  }, [])

  const startDrag = useCallback(
    (widget: DashboardWidget, mode: GridDragMode, event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      // 只响应主键（鼠标左键 / 触摸 / 笔），右键与中键不参与拖动
      if (event.button !== 0) return
      const measured = measure()
      if (!measured) return

      event.preventDefault()
      event.stopPropagation()
      // 下面的 preventDefault 会挡掉 pointerdown 的默认聚焦行为，
      // 于是「用鼠标点一下手柄、再用方向键微调」会失效 —— 这里补一次显式聚焦
      event.currentTarget.focus()

      const session: DragSession = {
        id: widget.id,
        mode,
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
        columnStep: measured.columnStep,
        rowStep: measured.rowStep,
        direction: measured.rtl ? -1 : 1,
        latest: null,
      }
      sessionRef.current = session
      setActiveId(widget.id)

      // 拖拽期间禁止选中文本（快速拖动会把页面文字刷蓝）
      const previousUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'

      /** 由指针坐标算出布局（位移相对按下时起点，不做逐帧累加）。 */
      const compute = (clientX: number, clientY: number): DashboardWidget[] => {
        const base = widgetsRef.current
        const current = base.find((item) => item.id === session.id)
        if (!current) return base

        const dx = (clientX - session.pointerX) * session.direction
        const dy = clientY - session.pointerY

        if (session.mode === 'move') {
          const x = clampWidgetX(
            session.origin.x + Math.round(dx / session.columnStep),
            session.origin.w,
          )
          const y = Math.max(0, session.origin.y + Math.round(dy / session.rowStep))
          return compactLayout(
            base.map((item) => (item.id === session.id ? { ...item, x, y } : item)),
            // 钉住被拖的这张：它停在指针位置，让位的是别的卡片。
            // 少了这个参数，上下排列时「把下面那张往上拖」会被压缩原样推回去。
            session.id,
          )
        }

        const w = clampWidgetWidth(session.origin.w + Math.round(dx / session.columnStep))
        // 高度用连续值吸附到档位：直接用 Math.round 会在档位间隔（2 行）中间
        // 出现「拖了一行毫无反应、再拖一点突然跳两行」的顿挫感。
        const h = snapHeight(session.origin.h + dy / session.rowStep)
        return compactLayout(
          base.map((item) =>
            item.id === session.id ? { ...item, w, h, x: clampWidgetX(item.x, w) } : item,
          ),
          session.id,
        )
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const next = compute(moveEvent.clientX, moveEvent.clientY)
        session.latest = next
        setPreview(next)
      }

      const finish = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        document.body.style.userSelect = previousUserSelect

        const finalLayout = sessionRef.current?.latest ?? null
        sessionRef.current = null
        setActiveId(null)
        setPreview(null)
        // 没动过（只是点了一下手柄）就不提交，避免无意义地写一次盘
        if (finalLayout) onCommit(finalLayout)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    },
    [enabled, measure, onCommit],
  )

  /**
   * 键盘调整（手柄聚焦后按方向键）。
   *
   * 拖拽手柄的方向键**移动卡片**，缩放手柄的方向键**改尺寸** —— 与手柄语义一致，
   * 用户不需要额外记「Shift 是缩放」这类修饰键组合。
   * 左右方向同样按书写方向翻转。
   */
  const nudge = useCallback(
    (widget: DashboardWidget, mode: GridDragMode, event: ReactKeyboardEvent<HTMLElement>) => {
      if (!enabled) return
      const measured = measure()
      const direction = measured?.rtl ? -1 : 1

      const horizontal =
        event.key === 'ArrowRight' ? direction : event.key === 'ArrowLeft' ? -direction : 0
      const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (horizontal === 0 && vertical === 0) return

      event.preventDefault()

      const base = widgetsRef.current
      const next = base.map((item) => {
        if (item.id !== widget.id) return item
        if (mode === 'move') {
          const x = clampWidgetX(item.x + horizontal, item.w)
          const y = Math.max(0, item.y + vertical)
          return { ...item, x, y }
        }
        const w = clampWidgetWidth(item.w + horizontal)
        // 上下键在缩放手柄上换的是**档位**（+1 / -1 级），不是 1 行
        const h = stepHeight(item.h, vertical)
        return { ...item, w, h, x: clampWidgetX(item.x, w) }
      })

      // 与拖动同一套语义：被调整的这张先落位，其余卡片绕开它 ——
      // 否则「把下面那张往上移一格」会被压缩原样推回去，方向键看起来毫无反应
      onCommit(compactLayout(next, widget.id))
    },
    [enabled, measure, onCommit],
  )

  const startMove = useCallback(
    (widget: DashboardWidget, event: ReactPointerEvent<HTMLElement>) =>
      startDrag(widget, 'move', event),
    [startDrag],
  )
  const startResize = useCallback(
    (widget: DashboardWidget, event: ReactPointerEvent<HTMLElement>) =>
      startDrag(widget, 'resize', event),
    [startDrag],
  )
  const nudgeMove = useCallback(
    (widget: DashboardWidget, event: ReactKeyboardEvent<HTMLElement>) =>
      nudge(widget, 'move', event),
    [nudge],
  )
  const nudgeResize = useCallback(
    (widget: DashboardWidget, event: ReactKeyboardEvent<HTMLElement>) =>
      nudge(widget, 'resize', event),
    [nudge],
  )

  return {
    gridRef,
    /** 渲染用的布局（拖动期间是预览）。 */
    layout,
    /** 正在被拖动 / 缩放的卡片 id。 */
    activeId,
    startMove,
    startResize,
    nudgeMove,
    nudgeResize,
  }
}
