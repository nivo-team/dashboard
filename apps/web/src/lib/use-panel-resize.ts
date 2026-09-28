import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/**
 * 可拖动面板的宽度调整 —— 复刻 Kumo `Sidebar.ResizeHandle` 的交互模式。
 *
 * 本文件有两个 hook：`usePanelResize`（下面这个，挤压式面板的**宽度**）与
 * `useFloatPanelResize`（文件末尾，贴角浮窗的**宽 + 高**）。两者共用 clamp 与
 * `data-panel-resizing` 那套全局光标 / 禁选，手感因此完全一致。
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

function clamp(value: number, min: number, max: number): number {
  // min > max（配置异常 / 视口过窄）时以 min 为准，保证拖拽不会得到 NaN 或负值
  if (min > max) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 拖拽期间挂在 `documentElement` 的 `data-panel-resizing` 上的**光标种类**：
 * `col` = 竖边手柄（改宽）、`row` = 横边手柄（改高）、`both` = 角手柄（同时改）。
 * 具体样式在 `src/styles.css` —— 指针拖出手柄后，只有根节点上的全局规则还能管住光标。
 */
type ResizeCursor = 'col' | 'row' | 'both'

function setResizeCursor(cursor: ResizeCursor | null) {
  if (cursor === null) delete document.documentElement.dataset.panelResizing
  else document.documentElement.dataset.panelResizing = cursor
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
        lastWidth = clamp(startWidth + delta, minWidth, maxWidth)
        emit(lastWidth)
      }

      const stop = () => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', stop)
        document.removeEventListener('pointercancel', stop)
        setResizeCursor(null)
        stopRef.current = null
        setResizing(false)
        latest.current.onCommit?.(lastWidth)
      }

      setResizeCursor('col')
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
      const clamped = clamp(next, current.min, current.max)
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

/*
 * ---------------------------------------------------------------------------
 * 浮窗（Float）：两个方向都能拖
 * ---------------------------------------------------------------------------
 *
 * 与上面的 `usePanelResize` 分开而不是加参数，是因为**锚点不一样**：
 * 分屏面板嵌在外壳里、只有宽度可变，锚点是对侧那条边；浮窗是贴角的小窗，
 * 宽度手柄贴行首边、高度手柄贴顶边，**底边与行尾边固定**。
 * 把两者塞进同一个 hook，只会让「锚点在哪」这个关键信息变成一堆布尔开关。
 *
 * 手感与上面完全一致（`document` 级监听、`pointercancel` 收尾、`data-panel-resizing`
 * 接管光标与禁选）—— 这一套是复刻 Kumo 的，不要再引入第二套。
 */

/** 浮窗尺寸（px）：两个方向都能拖，所以是一个二维值而不是单个宽度。 */
export interface FloatPanelSize {
  width: number
  height: number
}

/** 一个手柄改哪个方向：`inline` = 宽度（行首边）、`block` = 高度（顶边）、`both` = 角手柄 */
export type FloatResizeAxis = 'inline' | 'block' | 'both'

export interface FloatResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface UseFloatPanelResizeOptions {
  /**
   * 浮窗**贴的物理侧**（面板侧，不是手柄侧）：LTR 贴行尾侧下角 → `right`；
   * RTL 贴行首侧下角 → `left`。与 `usePanelResize` 的 `side` 完全同一个意思。
   *
   * 拖拽方向与方向键都从它推导 —— 手柄永远在面板的**行首边**
   * （`side === 'left'` 时手柄在面板右侧，指针右移 = 变宽）。
   */
  side: PanelSide
  /** 受控尺寸（px） */
  size: FloatPanelSize
  minWidth: number
  maxWidth: number
  minHeight: number
  /**
   * 高度上限。允许传函数：视口矮时上限要降到「视口高 − 边距」，而视口高度只有运行时才知道；
   * 拖动与按键每次都会重新求值，窗口在拖动中被改小也不会把浮窗顶出屏幕。
   */
  maxHeight: number | (() => number)
  /**
   * 拖动 / 按键过程中的尺寸 —— **每次 pointermove 都会调用**，必须是即时状态
   * （组件本地 state），不要在这里写盘（理由与 `usePanelResize.onChange` 相同）。
   */
  onChange: (size: FloatPanelSize) => void
  /** 一次调整结束（松手 / 每次按键各一次）—— 持久化的正确接点 */
  onCommit?: (size: FloatPanelSize) => void
  /** 浮窗元素（强烈建议传）：`pointerdown` 时实测真实尺寸，而不是信任可能被 CSS 压小的受控值 */
  panelRef?: RefObject<HTMLElement | null>
  /** 键盘步进（px），默认 10（与 `usePanelResize` 一致） */
  step?: number
}

export interface UseFloatPanelResizeResult {
  /** 是否正在拖动 */
  resizing: boolean
  /** 行首边手柄：只改宽度 */
  widthHandleProps: FloatResizeHandleProps
  /** 顶边手柄：只改高度 */
  heightHandleProps: FloatResizeHandleProps
  /** 行首上角手柄：同时改宽高 */
  cornerHandleProps: FloatResizeHandleProps
}

function resolveMaxHeight(maxHeight: number | (() => number)): number {
  return typeof maxHeight === 'function' ? maxHeight() : maxHeight
}

export function useFloatPanelResize({
  side,
  size,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  onChange,
  onCommit,
  panelRef,
  step = 10,
}: UseFloatPanelResizeOptions): UseFloatPanelResizeResult {
  const [resizing, setResizing] = useState(false)

  /**
   * 与 `usePanelResize` 同一套做法：拖动与键盘回调只注册一次，
   * 最新值统一走 ref 读 —— 否则每帧 `onChange` 引发的重渲染都会换掉正在跑的监听。
   */
  const latest = useRef({
    side,
    size,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    onChange,
    onCommit,
    panelRef,
    step,
  })
  latest.current = {
    side,
    size,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    onChange,
    onCommit,
    panelRef,
    step,
  }

  /** 卸载兜底：拖动中浮窗被卸载（切路由 / 关面板）时必须摘掉 document 监听 */
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])

  const handlePointerDown = useCallback(
    (axis: FloatResizeAxis, event: ReactPointerEvent<HTMLElement>) => {
      // 只响应主键；中键 / 右键拖拽不改尺寸
      if (event.button !== 0) return
      event.preventDefault()

      const current = latest.current
      const rect = current.panelRef?.current?.getBoundingClientRect()
      const startWidth = rect && rect.width > 0 ? rect.width : current.size.width
      const startHeight = rect && rect.height > 0 ? rect.height : current.size.height
      const startX = event.clientX
      const startY = event.clientY
      /** 拖动过程中最后一次真正落下的尺寸，松手时由它触发 onCommit */
      let last: FloatPanelSize = { width: startWidth, height: startHeight }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const c = latest.current
        /*
          宽度：手柄永远在面板的**行首边**、锚点在行尾边 —— 指针往哪边挪，
          手柄（= 行首边）就往哪边挪，于是"变大"的方向跟着书写方向翻：
          - LTR：浮窗贴右下角，手柄在左，指针**左移**（dx < 0）变宽；
          - RTL：浮窗贴左下角，手柄在右，指针**右移**（dx > 0）变宽。

          这正是 `usePanelResize` 里 `delta` 的算法：`side` 是面板的物理侧，
          贴左侧时取 `+dx`、贴右侧时取 `-dx`。两处务必保持同一个约定 ——
          曾经这里按"忽略书写方向"算，RTL 下拖拽方向就是反的。

          高度不受书写方向影响：顶边往上拖（dy < 0）就是变高。

          **不改的那个方向沿用受控值**（而不是 `pointerdown` 时实测到的那个数）：
          折叠态的浮窗只有头行那么高，若把实测高度写回去，一次"只改宽度"的拖动
          就会把展开后的高度永久压扁。
        */
        const delta = c.side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
        const next: FloatPanelSize = {
          width:
            axis === 'block'
              ? c.size.width
              : clamp(startWidth + delta, c.minWidth, c.maxWidth),
          height:
            axis === 'inline'
              ? c.size.height
              : clamp(
                  startHeight - (moveEvent.clientY - startY),
                  c.minHeight,
                  resolveMaxHeight(c.maxHeight),
                ),
        }
        last = next
        c.onChange(next)
      }

      const stop = () => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', stop)
        document.removeEventListener('pointercancel', stop)
        setResizeCursor(null)
        stopRef.current = null
        setResizing(false)
        latest.current.onCommit?.(last)
      }

      setResizeCursor(axis === 'inline' ? 'col' : axis === 'block' ? 'row' : 'both')
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', stop)
      // 指针被系统中断（触摸被取消、切窗口）时也要收尾，否则光标会一直卡在 resize 上
      document.addEventListener('pointercancel', stop)
      stopRef.current = stop
      setResizing(true)
    },
    [],
  )

  const handleKeyDown = useCallback((axis: FloatResizeAxis, event: KeyboardEvent<HTMLElement>) => {
    const current = latest.current

    /**
     * 一次按键就是一个完整调整：即时值 + 持久化一起写。
     *
     * 只夹**本次要改的那个方向**：`patch` 里没有的方向保持受控值原样。
     * 否则在矮窗口里按一下方向键改宽度，会顺手把高度也按视口上限夹小、还写进存档。
     */
    const apply = (patch: Partial<FloatPanelSize>) => {
      const next: FloatPanelSize = {
        width: clamp(patch.width ?? current.size.width, current.minWidth, current.maxWidth),
        height: clamp(
          patch.height ?? current.size.height,
          current.minHeight,
          resolveMaxHeight(current.maxHeight),
        ),
      }
      current.onChange(next)
      current.onCommit?.(next)
    }

    // 手柄在行首边：面板贴左侧（RTL）时手柄在右，「往外推」= `ArrowRight`
    const widthGrow = current.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const widthShrink = current.side === 'left' ? 'ArrowLeft' : 'ArrowRight'

    if (axis !== 'block' && (event.key === widthGrow || event.key === widthShrink)) {
      event.preventDefault()
      apply({
        width: current.size.width + (event.key === widthGrow ? current.step : -current.step),
      })
      return
    }

    if (axis !== 'inline' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      apply({
        height: current.size.height + (event.key === 'ArrowUp' ? current.step : -current.step),
      })
      return
    }

    // `Home` / `End` 只在单轴手柄上有明确语义（角手柄同时管两个方向，跳过）
    if (event.key === 'Home' || event.key === 'End') {
      if (axis === 'inline') {
        event.preventDefault()
        apply({ width: event.key === 'Home' ? current.minWidth : current.maxWidth })
      } else if (axis === 'block') {
        event.preventDefault()
        apply({
          height: event.key === 'Home' ? current.minHeight : resolveMaxHeight(current.maxHeight),
        })
      }
    }
  }, [])

  const bind = useCallback(
    (axis: FloatResizeAxis): FloatResizeHandleProps => ({
      onPointerDown: (event) => handlePointerDown(axis, event),
      onKeyDown: (event) => handleKeyDown(axis, event),
    }),
    [handlePointerDown, handleKeyDown],
  )

  return {
    resizing,
    widthHandleProps: bind('inline'),
    heightHandleProps: bind('block'),
    cornerHandleProps: bind('both'),
  }
}
