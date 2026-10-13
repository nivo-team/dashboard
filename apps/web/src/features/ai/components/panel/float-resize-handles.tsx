import { useTranslation } from 'react-i18next'
import { AI_FLOAT_MAX_WIDTH, AI_FLOAT_MIN_HEIGHT, AI_FLOAT_MIN_WIDTH } from '#/lib/store'
import type { FloatResizeHandleProps } from '#/lib/use-panel-resize'
import { cn } from '#/lib/cn'

/**
 * 浮窗（Float）的三个尺寸手柄：顶边（改高）、行首边（改宽）、行首上角（两个都改）。
 *
 * 不用 CSS 的 `resize: both`：它只能改右下角、不跟 RTL、`overflow-hidden` 下不出现，
 * 而且完全不支持键盘（读屏与键盘用户就彻底改不了尺寸）。这里用最朴素的做法 ——
 * 三条绝对定位的透明热区，拖拽与方向键逻辑在 `#/lib/use-panel-resize`。
 *
 * **刻意不画任何常驻 / hover 视觉**：提示只在**鼠标样式**上（`ns-resize` /
 * `ew-resize` / 对角）。之前 hover 浮出的细线、角上那段直角，都会在浮窗边缘"多出一笔"
 * 干扰阅读，而此刻光标已经说明了一切 —— 所以一律去掉（拖拽期间同样不画）。
 * 只保留键盘焦点的细线：没有它，Tab 到某个手柄的键盘用户不知道自己在哪。
 *
 * 手柄是浮窗**内部**的绝对定位热区，靠 `z-20` 压在内容之上；
 * **移动端 / 折叠态 / 变形期间都不挂**（见 `AiFloatPanel` 的调用处）。
 */
export function AiFloatResizeHandles({
  size,
  resolveMaxHeight,
  widthHandleProps,
  heightHandleProps,
  cornerHandleProps,
}: {
  /** 当前档位的宽高（用于 `aria-valuenow`） */
  size: { width: number; height: number }
  /** 高度上限**每次求值**（视口变矮时它跟着变，不能挂载时算一次就定死） */
  resolveMaxHeight: () => number
  widthHandleProps: FloatResizeHandleProps
  heightHandleProps: FloatResizeHandleProps
  cornerHandleProps: FloatResizeHandleProps
}) {
  const { t } = useTranslation('ai')

  return (
    <>
      {/* 顶边：只改高度 */}
      <AiFloatResizeHandle
        label={t('resizeFloatHeight', '调整浮窗高度')}
        orientation="horizontal"
        valueNow={size.height}
        valueMin={AI_FLOAT_MIN_HEIGHT}
        valueMax={resolveMaxHeight()}
        handleProps={heightHandleProps}
        className="inset-x-0 top-0 h-1.5 cursor-ns-resize"
        focusLineClassName="inset-x-0 my-auto h-0.5"
      />
      {/* 行首边：只改宽度 */}
      <AiFloatResizeHandle
        label={t('resizeFloatWidth', '调整浮窗宽度')}
        orientation="vertical"
        valueNow={size.width}
        valueMin={AI_FLOAT_MIN_WIDTH}
        valueMax={AI_FLOAT_MAX_WIDTH}
        handleProps={widthHandleProps}
        className="inset-y-0 start-0 w-1.5 cursor-ew-resize"
        focusLineClassName="inset-y-0 mx-auto w-0.5"
      />
      {/* 行首上角：同时改宽高（对角光标在 RTL 下镜像成 `nesw`） */}
      <AiFloatResizeHandle
        label={t('resizeFloat', '调整浮窗大小')}
        handleProps={cornerHandleProps}
        className="start-0 top-0 size-3 cursor-nwse-resize rtl:cursor-nesw-resize"
        focusLineClassName="start-1 top-1 size-1.5 rounded-full"
      />
    </>
  )
}

interface AiFloatResizeHandleProps {
  /** 可访问名称（「调整浮窗宽度 / 高度 / 大小」） */
  label: string
  /**
   * 手柄的**视觉**朝向，直接作为 `aria-orientation`：竖边手柄（改宽）= `vertical`，
   * 横边手柄（改高）= `horizontal`。角手柄两个方向都管，不传。
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * 手柄当前对应的尺寸值（**已含视口上限**的上限值由调用方给）。
   * 角手柄一次改两个数，没有单一数值可报，不传。
   */
  valueNow?: number
  valueMin?: number
  valueMax?: number
  /** `#/lib/use-panel-resize` 的 `useFloatPanelResize()` 给出的某一轴属性 */
  handleProps: FloatResizeHandleProps
  /** 热区的位置 / 大小 / 光标（绝对定位，相对浮窗） */
  className: string
  /**
   * **键盘焦点**提示线的几何（绝对定位 + 尺寸 / 位置）——
   * 鼠标怎么划都不会出现，只在 `:focus-visible`（Tab 进来）时显形。
   */
  focusLineClassName: string
}

/**
 * `role="separator"` + `tabIndex={0}` 是 ARIA 的窗口分隔条语义：因此它必须能拿焦点、
 * 必须有名字，方向键 / `Home` / `End` 由 hook 处理。
 */
function AiFloatResizeHandle({
  label,
  orientation,
  valueNow,
  valueMin,
  valueMax,
  handleProps,
  className,
  focusLineClassName,
}: AiFloatResizeHandleProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={valueNow === undefined ? undefined : Math.round(valueNow)}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax === undefined ? undefined : Math.round(valueMax)}
      className={cn('group absolute z-20 focus:outline-none', className)}
      {...handleProps}
    >
      <span
        aria-hidden
        className={cn(
          'absolute bg-transparent transition-colors group-focus-visible:bg-kumo-hairline',
          focusLineClassName,
        )}
      />
    </div>
  )
}
