import { motion } from 'motion/react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { AI_FLOAT_VIEWPORT_MARGIN } from '#/lib/store'
import type { FloatResizeHandleProps } from '#/lib/use-panel-resize'
import { cn } from '#/lib/cn'
import { isDesktop } from '#/native/bridge'
import { FLOAT_COLLAPSE_EASE, FLOAT_COLLAPSE_MS } from './constants'
import { resolveFloatGeometry } from './float-geometry'
import { AiFloatResizeHandles } from './float-resize-handles'
import { AiPanelSurface } from './panel-surface'

/**
 * **Float 形态**：从页面底部升起的小窗，停在行尾侧下角（LTR 右下、RTL 左下），
 * 浮在内容之上（`fixed`，不挤压布局）。
 *
 * ## 两件「动画期间不重排文本」的事
 *
 * 1. 变形**只动外框的宽高**，内层钉在展开尺寸上被 `overflow-hidden` 裁切 ——
 *    于是每帧要重新布局的只有外框，会话里的文字一次都不用重新换行；
 * 2. **变形期间保持展开态的内容**（`surfaceCollapsed`，见 `float-geometry`）——
 *    一变就直接换成窄条头行的话，动画就没有内容可收缩了。
 *
 * ## 入场与关闭
 *
 * 入场是 CSS 动画（`styles.css` 的 `[data-ai-float='true']`），**关闭即卸载**（没有退场）。
 * 「从最大化返回」时不能演那一次入场（面板一直开着、只是宿主被卸载过），
 * 所以 `skipEnter` 决定要不要带那个属性 —— 它是**挂载时快照**（属性在元素存活期内
 * 来回变会让动画重新触发）。
 *
 * ## 三处降级
 *
 * - **移动端**：整屏覆盖（`inset-0`），折叠不成立、也没有可拖的尺寸；
 * - **关掉「界面动效」**：不带入场属性、折叠直接切到位（`motionEnabled`）；
 * - **桌面原生壳**：位置/圆角用另一套类（不进 `md:` 断点分支）。
 */
export interface AiFloatPanelProps {
  open: boolean
  /** 外壳给的受控折叠态 */
  collapsed: boolean
  /** 存档 / 拖拽出来的那一档尺寸 */
  size: { width: number; height: number }
  /** 目标刚变过（折叠态与上一帧不同） */
  deforming: boolean
  /** 变形动画结束（或兜底计时到了）时归位 */
  onDeformEnd: () => void
  /** 这一次「出现」跳过入场（从最大化返回，见文件头） */
  skipEnter: boolean
  /** 能不能播动画（设置 → 外观「界面动效」且系统没要求减少动效） */
  motionEnabled: boolean
  isMobile: boolean
  panelRef: RefObject<HTMLElement | null>
  /** 高度上限**每次求值**（视口变矮时要跟着变，见 `AiPanel` 里那条注释） */
  resolveMaxHeight: () => number
  /** `useFloatPanelResize()` 给的三轴属性 */
  handleProps: {
    width: FloatResizeHandleProps
    height: FloatResizeHandleProps
    corner: FloatResizeHandleProps
  }
  onClose: () => void
  onToggleCollapsed?: () => void
  onMaximize?: () => void
  onOpenNewWindow?: () => void
}

export function AiFloatPanel({
  open,
  collapsed,
  size,
  deforming,
  onDeformEnd,
  skipEnter,
  motionEnabled,
  isMobile,
  panelRef,
  resolveMaxHeight,
  handleProps,
  onClose,
  onToggleCollapsed,
  onMaximize,
  onOpenNewWindow,
}: AiFloatPanelProps) {
  const { t } = useTranslation('ai')

  // 关闭即卸载：浮窗是浮层，消失不需要为它多留一帧
  if (!open) return null

  const isDesktopShell = isDesktop()
  const { isCollapsed, isDeforming, surfaceCollapsed, targetWidth, targetHeight } =
    resolveFloatGeometry({ collapsed, isMobile, deforming, motionEnabled, size })

  return (
    <motion.aside
      ref={panelRef}
      /*
        `data-ai-float` 就是入场动画的开关（styles.css 的 `ai-float-enter`）：
        从最大化返回时它不带这个属性，浮窗直接落在最终位置 —— 面板一直开着，不该再演一次。
        这个值来自挂载时的快照（`skipEnter`），之后 prop 复位也不会把它改回来。
        关掉「界面动效」时同样不带 —— 用户要的就是没有过渡。
      */
      data-ai-float={skipEnter || !motionEnabled ? undefined : 'true'}
      aria-label={t('title', 'Ask AI')}
      /*
        变形**只动外框的宽高**，内容钉在展开尺寸上被裁切（见下面那层 div）。
        每帧要重新布局的只有这个盒子，会话里的文字一次都不用重新换行 ——
        这正是「动画期间不重新排列文本」的做法，也是它比整块重排更省的原因。

        `initial={false}`：挂载瞬间直接落在目标尺寸上，入场动画由 styles.css 的
        `@keyframes ai-float-enter`（位移 + 淡入 + 极轻微缩放）负责，两者互不打扰。
      */
      initial={false}
      animate={
        isMobile
          ? // 移动端整屏：用 100% 覆盖 `inset-0`，顺带把上一档留下的像素值顶掉
            { width: '100%', height: '100%' }
          : { width: targetWidth, height: targetHeight }
      }
      /*
        **只有变形本身才带时长**：拖拽改尺寸走的是同一条 `animate`，若也带 220ms
        过渡，浮窗会一路追着光标跑、根本拖不准。其余情况一律 0 = 立即生效。
      */
      transition={
        isDeforming
          ? { duration: FLOAT_COLLAPSE_MS / 1000, ease: FLOAT_COLLAPSE_EASE }
          : { duration: 0 }
      }
      onAnimationComplete={onDeformEnd}
      /*
        `maxHeight` 与 hook 的拖拽上限同源（同一个 `AI_FLOAT_VIEWPORT_MARGIN`），
        视口变矮时把浮窗压回视口内 —— 两处一旦分叉，拖到上限时面板会先停住、
        再被 CSS 悄悄压小。宽高本身由 motion 写内联样式，不走这里。
      */
      style={isMobile ? undefined : { maxHeight: `calc(100svh - ${AI_FLOAT_VIEWPORT_MARGIN}px)` }}
      className={cn(
        'fixed z-30 flex flex-col overflow-hidden bg-kumo-base',
        /*
          移动端：仅在非桌面端视口下整屏覆盖（`inset-0`）。
          桌面端无论视口多窄，始终按 PC 原生右下角小窗呈现，绝不覆盖全屏。
        */
        !isDesktopShell &&
          'inset-0 md:top-auto md:start-auto md:end-4 md:bottom-4 md:rounded-xl md:border md:border-kumo-line md:shadow-lg',
        isDesktopShell &&
          'top-auto start-auto end-4 bottom-4 rounded-xl border border-kumo-line shadow-lg',
      )}
    >
      {/*
        内层在变形期间**钉住展开尺寸**（宽 + 高都写死），所以外框收缩时内容是被
        `overflow-hidden` **裁掉**的，而不是跟着重排 —— 文字换行、头像位置一律不动。
        钉的尺寸取当前的 `size`：收起时它是「出发尺寸」、展开时是「到达尺寸」，
        两种方向都对（变形结束就解除钉住，折叠态真正只剩头行那一条）。
      */}
      <div
        className="flex h-full w-full flex-col"
        style={isDeforming ? { width: size.width, height: size.height } : undefined}
      >
        <AiPanelSurface
          onClose={onClose}
          collapsed={surfaceCollapsed}
          // 移动端不挂折叠按钮（`isCollapsed` 恒为 false，两者的判断保持一致）
          onToggleCollapsed={isMobile ? undefined : onToggleCollapsed}
          onMaximize={onMaximize}
          onOpenNewWindow={onOpenNewWindow}
        />
      </div>
      {/*
        尺寸手柄只在桌面端挂：移动端浮窗是整屏，没有可拖的尺寸。

        **折叠态三个手柄一个都不挂**：窄条的宽就是最小宽度、高就是头行，拖它没有意义；
        更重要的是拖拽会在 `onCommit` 里落盘，而折叠期间的尺寸**不该污染存档** ——
        存档要留着「上次展开时的宽高」，展开才能原样恢复（见 `float-geometry` 的注释）。

        变形期间同样不挂：此刻外框的宽高是动画在写，热区跟着它一起动只会误触。
      */}
      {isMobile || isCollapsed || isDeforming ? null : (
        <AiFloatResizeHandles
          size={size}
          resolveMaxHeight={resolveMaxHeight}
          widthHandleProps={handleProps.width}
          heightHandleProps={handleProps.height}
          cornerHandleProps={handleProps.corner}
        />
      )}
    </motion.aside>
  )
}
