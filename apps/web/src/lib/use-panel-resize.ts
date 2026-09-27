import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/**
 * 可拖动面板的宽度调整 —— 复刻 Kumo `Sidebar.ResizeHandle` 的交互模式。
 *
 * **为什么手写而不是装库**：Kumo 的 `Sidebar` 本身就是手写的（`@cloudflare/kumo` 的依赖里
 * 没有任何面板 / 拖拽库，拖拽就是 `pointerdown` + `document` 上的 `pointermove/pointerup`），
 * 核心逻辑约 40 行。复刻它换来的是：零新增依赖，且分屏面板与侧边栏的**手感、光标、
 * hover 反馈、键盘语义完全一致**（仓库里已经有一套这样的交互，没必要引入第二套）。
 *
 * 逐项对齐的行为（与 Kumo 相同）：
 * - `pointerdown` 时用 `getBoundingClientRect()` **实测**起始宽度，而不是信任受控值 ——
 *   面板宽度可能被 CSS（`max-width`、窄视口）压小，直接用受控值会让拖动一开始就跳；
 * - 拖动方向由面板的**物理侧**决定：`side === 'left'` 时 `delta = clientX - startX`，
 *   `'right'` 时取反（面板在右，向左拖才是变宽）；
 * - 监听挂在 `document` 上（不是 `setPointerCapture`）：指针移出面板、移出窗口都不会断；
 * - 键盘：方向键 ±`step`（方向随 side 翻转）、`Home` 到最小值、`End` 到最大值；
 * - 拖动期间通过 `documentElement` 上的 `data-panel-resizing` 统一光标与禁选
 *   （见 `src/styles.css`；Kumo 没有做这一步，拖拽时选中文本会更难受）。
 *
 * 与 Kumo 的差异只有一处：Kumo 把宽度状态放在 `Sidebar.Provider` 里，这里做成**受控 hook**
 * （`width` + `onChange`），因为分屏宽度的真值在 `admin.shell-ui` 里（与侧边栏宽度同源），
 * 组件不应该再持有一份。
 */

export type PanelSide = 'left' | 'right'

export interface UsePanelResizeOptions {
  /** 面板的**物理**侧（不是逻辑 start/end）：RTL 下面板会跑到左侧，调用方需随之切换 */
  side: PanelSide
  /** 宽度下限（px） */
  min: number
  /** 宽度上限（px） */
  max: number
  /** 受控宽度（px）：没有实测值时作为拖动起点，也是键盘步进的基准 */
  width: number
  /**
   * 拖动 / 按键过程中的宽度变化 —— **每次 pointermove 都会调用**，
   * 所以这里必须是「即时状态」的写入（组件本地 state），不能是节流后的持久化。
   */
  onChange: (width: number) => void
  /**
   * 一次调整**结束时**的最终宽度（松手 / 每次按键各一次）。
   *
   * 持久化的正确接点是这里而不是 `onChange`：拖动中每帧都写 localStorage 会卡，
   * 而给 `onChange` 加节流又会让面板滞后几百毫秒才跟手 —— `onCommit` 两边都避开。
   */
  onCommit?: (width: number) => void
  /**
   * 面板元素（可选，但强烈建议传）：用于 `pointerdown` 时实测真实宽度。
   * 不传则退化为使用受控 `width`。
   */
  panelRef?: RefObject<HTMLElement | null>
  /** 键盘步进（px），默认 10（与 Kumo 一致） */
  step?: number
}

export interface UsePanelResizeResult {
  /** 是否正在拖动（可用于拖动期临时关掉过渡、或切换手柄的激活态） */
  resizing: boolean
  /** 直接展开到手柄元素上：`<button {...handleProps} />` */
  handleProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
}

function clampWidth(value: number, min: number, max: number): number {
  // min > max（配置异常 / 视口过窄）时以 min 为准，保证拖拽不会得到 NaN 或负宽
  if (min > max) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function usePanelResize({
  side,
  min,
  max,
  width,
  onChange,
  onCommit,
  panelRef,
  step = 10,
}: UsePanelResizeOptions): UsePanelResizeResult {
  const [resizing, setResizing] = useState(false)

  /**
   * 拖动与键盘回调都注册一次就不再重建，所以最新值统一走 ref 读取 ——
   * 否则每帧 `onChange` 触发重渲染都会重建 document 监听，拖动中段的监听会被换掉。
   */
  const latest = useRef({ side, min, max, width, onChange, onCommit, step, panelRef })
  latest.current = { side, min, max, width, onChange, onCommit, step, panelRef }

  /** 卸载兜底：拖动中组件被卸载（切路由 / 关浮层）时，必须摘掉 document 监听 */
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // 只响应主键；中键 / 右键拖拽不改变宽度
      if (event.button !== 0) return
      event.preventDefault()

      const current = latest.current
      const measured = current.panelRef?.current?.getBoundingClientRect().width
      const startWidth =
        measured && measured > 0 ? measured : current.width
      const startX = event.clientX
      /** 拖动过程中最后一次真正落下的宽度，松手时由它触发 onCommit */
      let lastWidth = startWidth

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const { side: currentSide, min: minWidth, max: maxWidth, onChange: emit } =
          latest.current
        const delta =
          currentSide === 'left'
            ? moveEvent.clientX - startX
            : startX - moveEvent.clientX
        lastWidth = clampWidth(startWidth + delta, minWidth, maxWidth)
        emit(lastWidth)
      }

      const stop = () => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', stop)
        document.removeEventListener('pointercancel', stop)
        delete document.documentElement.dataset.panelResizing
        stopRef.current = null
        setResizing(false)
        latest.current.onCommit?.(lastWidth)
      }

      document.documentElement.dataset.panelResizing = 'true'
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', stop)
      // 指针被系统中断（触摸被取消、切窗口）时也要收尾，否则光标会一直卡在 col-resize
      document.addEventListener('pointercancel', stop)
      stopRef.current = stop
      setResizing(true)
    },
    [],
  )

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const current = latest.current
    const grow = current.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = current.side === 'left' ? 'ArrowLeft' : 'ArrowRight'

    /** 键盘一次按键就是一个完整的调整：即时值 + 持久化一起写 */
    const apply = (next: number) => {
      const clamped = clampWidth(next, current.min, current.max)
      current.onChange(clamped)
      current.onCommit?.(clamped)
    }

    if (event.key === grow) {
      event.preventDefault()
      apply(current.width + current.step)
    } else if (event.key === shrink) {
      event.preventDefault()
      apply(current.width - current.step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      apply(current.min)
    } else if (event.key === 'End') {
      event.preventDefault()
      apply(current.max)
    }
  }, [])

  return { resizing, handleProps: { onPointerDown: handlePointerDown, onKeyDown: handleKeyDown } }
}
