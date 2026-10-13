import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SHELL_PANEL_FRAME, SidePanelResizeHandle } from '#/components/side-panel'
import { isDesktop, isDesktopMac } from '#/native/bridge'
import { cn } from '#/lib/cn'
import {
  AI_FLOAT_MAX_HEIGHT,
  AI_FLOAT_MAX_WIDTH,
  AI_FLOAT_MIN_HEIGHT,
  AI_FLOAT_MIN_WIDTH,
  AI_FLOAT_VIEWPORT_MARGIN,
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  persistAiFloatSize,
  persistAiPanelWidth,
  usePreferencesStore,
  useShellUiStore,
} from '#/lib/store'
import { useLocale } from '#/lib/use-locale'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useMotionEnabled } from '#/lib/use-motion'
import { useFloatPanelResize, usePanelResize } from '#/lib/use-panel-resize'
import { FLOAT_COLLAPSE_MS, SPLIT_SLIDE_MS } from './constants'
import { AiFloatPanel } from './float-panel'
import { AiPanelSurface } from './panel-surface'

export interface AiPanelProps {
  /** 是否展开 */
  open: boolean
  /** 请求关闭（关闭按钮 / Esc） */
  onClose: () => void
  /**
   * Float 浮窗是否折成「只有头行」的窄条。
   *
   * **真值在外壳**（`AppShell`）：顶栏「Ask AI」按钮要按它决定那一下是展开还是关闭，
   * 所以面板只做受控显示，自己不存。Split 形态忽略它（没有折叠态）。
   */
  collapsed?: boolean
  /**
   * 折叠 / 展开切换。
   *
   * 传了才有折叠按钮（Split 分支不把它转给头行，因此不会出现那颗按钮）；
   * 移动端也不发 —— 整屏浮窗折不出来。
   */
  onToggleCollapsed?: () => void
  /**
   * 「最大化」：跳到全屏 AI 对话页（`/$appId/sphere`）。
   *
   * **导航由外壳负责**（`AppShell` 的 `handleMaximizeAi`）：面板不知道自己挂在哪个
   * `$appId` 下，也不该知道目标路由长什么样 —— 与 `onClose` / `onToggleCollapsed`
   * 同一套受控约定。传了才画那颗按钮。
   */
  onMaximize?: () => void
  /** 在独立新窗口中打开对话（桌面端专属入口，位于放大按钮左侧） */
  onOpenNewWindow?: () => void
  /**
   * 跳过**这一次**入场动画（外壳在「从最大化返回」时置真，见 `AppShell`）。
   *
   * 那种情况下面板并没有被关掉过 —— 它一直开着，只是宿主 `AppShell` 在 `/sphere`
   * 期间被卸载了。再演一遍「Float 从底部升起 / Split 从 0 宽滑入」会读成
   * 「面板被关掉又打开」。外壳只在**返回后的首帧**置真、随后复位，
   * 所以用户自己开关面板时那一次真正的「打开」照常演。
   */
  skipEnterAnimation?: boolean
}

/**
 * AI 面板：「Ask AI」按钮对应的那块界面，两种打开方式共用同一个内部骨架（`AiPanelSurface`）。
 *
 * 形态由 设置 → AI（`/settings/AI`）的 `admin.preferences:<appId>.aiPanelMode` 决定：
 *
 * - **Split View**（`split`）：外壳级的一整列，与 `Sidebar` **同级**（`SHELL_PANEL_FRAME`
 *   就是 styles.css 给侧边栏的那套 `sticky top-0`，高度按 `--shell-chrome-h` 扣掉窗口条）
 *   —— 从这一列的顶部齐平开始、整列高，夹在侧边栏与内容区之间，挤压内容而不覆盖它。
 *   它挂载在 `Sidebar.Provider` 内容列**之后的兄弟节点**上（见 `#/layouts` 的 `ai` 插槽），
 *   内部头行固定 `h-[58px]` 与 `AppHeader` 同高，浏览器里两条底边线连成一条
 *   （桌面壳里顶栏被 44px 的窗口条取代，这条对齐关系不存在，头行高度暂时保持 58px）。
 *   **进场 / 退场是「宽度 0 ↔ panelWidth」的过渡**：面板贴行尾，宽度一变就把内容列推开
 *   （推动页面），内层钉住最终宽度因而读起来是「从行尾侧滑进来」而不是被挤开；
 *   退场期间面板仍需留在树上等动画跑完，所以开关是三段式状态（`splitMounted` /
 *   `splitExpanded` / `splitAnimating`，见下面的注释）；
 * - **Float**（`float`）：**从页面底部升起**的浮窗，停在**行尾侧下角**（LTR 右下、RTL 左下）、
 *   浮在内容之上（`fixed`，不挤压布局）—— 细节（变形、手柄、入场、降级）全在 `./float-panel`，
 *   这里只负责它的**受控尺寸**（宽高来自 store）与「折叠态从哪来」。
 *
 * 两处的降级：
 * - **移动端**：Split 退化成覆盖整屏的面板（没有可动的宽度，进 / 退场即时切换）、
 *   Float 也收成整屏 —— 窄屏放不下并列两列，差异只剩尺寸与位置；
 * - **Esc 关闭**：面板没有遮罩可以点，键盘退出只能自己接（会让位给已处理 Esc 的上层浮层）。
 *
 * 尺寸都落在 `admin.shell-ui`（与详情面板 / 侧边栏同源）：拖动中的即时值放本地 state，
 * 松手 / 键盘调整才由 `onCommit` 落盘 —— 与 `detail-preview` 完全一致的理由
 * （每帧写 localStorage 会卡，给 store 加节流又会让面板滞后）。
 * Split 只有宽度（`aiPanelWidth`），Float 是宽 + 高（`aiFloatWidth` / `aiFloatHeight`）。
 *
 * **两处入场动画都按「挂载」触发**（Split 的宽度过渡 / Float 的入场 CSS 动画），
 * 于是「从最大化返回」时会各自重播一次 —— 而面板那时一直开着（只是宿主被卸载过），
 * 再演一遍会读成「被关掉又打开」。外壳为此在返回后的首帧传 `skipEnterAnimation`，
 * 两种形态各自记住这个快照（见 `skipEnterOnce` / `floatSkipEnter`）。
 */
export function AiPanel({
  open,
  onClose,
  collapsed = false,
  onToggleCollapsed,
  onMaximize,
  onOpenNewWindow,
  skipEnterAnimation = false,
}: AiPanelProps) {
  const { t } = useTranslation('ai')
  const { isRtl } = useLocale()
  const isMobile = !isDesktop() && useIsMobileViewport()
  const mode = usePreferencesStore((state) => state.aiPanelMode)

  const storedPanelWidth = useShellUiStore((state) => state.aiPanelWidth)
  const [panelWidth, setPanelWidth] = useState(storedPanelWidth)
  const panelRef = useRef<HTMLElement | null>(null)

  const storedFloatWidth = useShellUiStore((state) => state.aiFloatWidth)
  const storedFloatHeight = useShellUiStore((state) => state.aiFloatHeight)
  const [floatSize, setFloatSize] = useState({
    width: storedFloatWidth,
    height: storedFloatHeight,
  })
  const floatPanelRef = useRef<HTMLElement | null>(null)

  /**
   * 「从最大化返回」时跳过**这一次**入场（见 `AiPanelProps.skipEnterAnimation`）。
   *
   * 两种形态的落点不同，但都必须是**挂载时的快照**：
   * - **Split**：初始就落在展开位（见下面 `splitMounted` / `splitExpanded` 的初值）；
   * - **Float**：入场是 CSS 动画，由 `data-ai-float="true"` 这个属性触发 —— 属性在元素
   *   存活期内来回变会让动画**重新触发**，所以这个决定记进 state，只在「浮窗从无到有」
   *   的那一次渲染里更新。
   */
  const skipEnterOnce = skipEnterAnimation && open

  /** 浮窗这一次「出现」要不要跳过入场（挂载时快照，prop 复位后不再影响已挂载的那个） */
  const floatVisible = mode === 'float' && open
  const [floatSkipEnter, setFloatSkipEnter] = useState(skipEnterOnce)
  const [floatWasVisible, setFloatWasVisible] = useState(false)
  /*
    渲染期派生（同下面 `floatDeforming` 的写法）：浮窗每次「重新出现」都重新读一次 prop ——
    外壳把 `skipEnterAnimation` 复位之后，用户自己打开浮窗那一次必须照常演入场。
  */
  if (floatVisible !== floatWasVisible) {
    setFloatWasVisible(floatVisible)
    if (floatVisible) setFloatSkipEnter(skipEnterAnimation)
  }

  /**
   * Split 形态的两段式开关（Float 不需要：它只有入场动画，关闭即卸载）。
   *
   * - `splitMounted`：在不在树上 —— **退场动画期间必须留在树上**，否则宽度还没收回就没了；
   * - `splitExpanded`：宽度的目标值。宽度 0 ↔ `panelWidth` 既是「推动内容」，也是
   *   「从行尾侧滑进来」（面板贴行尾，宽度一变，内容列跟着被推开）；
   * - `splitAnimating`：过渡窗口内为真，用来把内层**钉在最终宽度**上 ——
   *   否则动画期间内容是「被挤着重排」（文字不停换行）而不是「滑进来」。
   *
   * **初值不是写死的 `false`**：从最大化返回时面板一直开着（见 `skipEnterOnce`），
   * 第一帧就得落在展开位 —— 没有「0 宽」这个起点，浏览器也就不会播那次滑入。
   */
  const [splitMounted, setSplitMounted] = useState(skipEnterOnce)
  const [splitExpanded, setSplitExpanded] = useState(skipEnterOnce)
  const [splitAnimating, setSplitAnimating] = useState(false)
  /**
   * 这一次展开是不是「从最大化返回」的那次 —— **读一次就作废**：之后用户自己开关面板，
   * 那才是真正的一次展开 / 收起，必须照常演。
   */
  const skipSplitEnterRef = useRef(skipEnterOnce)

  /**
   * 现在能不能播动画：设置 → 外观 → 「界面动效」**且** 系统没要求减少动效
   * （判定统一在 `#/lib/use-motion`，不要在这里重拼条件）。
   * 关掉时面板的进出场、浮窗的升起与折叠变形一律**直接切到位**。
   */
  const motionEnabled = useMotionEnabled()

  /**
   * Float 这一次「展开 ↔ 折叠」的变形是不是还在跑（motion 的动效跑完即归位）。
   *
   * 为什么要这个标记：折叠不是**换一套内容**，而是**把同一套内容裁小** ——
   * 变形期间要保持展开态的内容、并把它钉在展开尺寸上，文字才不会每帧重新换行。
   * 变形结束才切成「只剩头行」的折叠态。
   *
   * 用**渲染期派生**（React 官方的「props 变了就调整 state」写法）而不是 `useEffect`：
   * 后者会让「已折叠」的那一帧先提交到 DOM 再被纠正，肉眼能看到内容闪一下。
   * 渲染期 `setState` 会被 React 立刻重算、中间那一帧根本不会提交。
   */
  const [floatDeforming, setFloatDeforming] = useState(false)
  const [lastCollapsed, setLastCollapsed] = useState(collapsed)
  if (lastCollapsed !== collapsed) {
    setLastCollapsed(collapsed)
    setFloatDeforming(true)
  }

  /*
    兜底：`motion` 的 `onAnimationComplete` 正常会先把它清掉；万一某个浏览器 /
    动效被打断导致它没来（那个状态下窄条会一直显示展开态的头行），这里按
    「时长 + 一点余量」再关一次。依赖里带上 `lastCollapsed`，连点两次也会重新计时。
  */
  useEffect(() => {
    if (!floatDeforming) return
    const timer = window.setTimeout(() => setFloatDeforming(false), FLOAT_COLLAPSE_MS + 120)
    return () => window.clearTimeout(timer)
  }, [floatDeforming, lastCollapsed])

  /** store 变化（其它标签页拖动、或存档水合）时把即时值拉平 */
  useEffect(() => {
    setPanelWidth(storedPanelWidth)
  }, [storedPanelWidth])

  useEffect(() => {
    setFloatSize({ width: storedFloatWidth, height: storedFloatHeight })
  }, [storedFloatWidth, storedFloatHeight])

  /** 打开就挂上；卸载交给下面那条（等退场动画跑完） */
  useEffect(() => {
    if (open) setSplitMounted(true)
  }, [open])

  /*
    面板这里**刻意不碰会话**：用哪一段由 `AiConversation` 挂载时的
    `loadHistory({ fresh })` 决定，判据是「本次页面载入是不是重新载入」
    （`#/features/ai/core/session-boot` 的 `isDocumentReload`）加上设置里的「新会话时机」。
    面板关掉再打开是同一份文档，当前会话（含流式回复已吐出的增量）必须原样留着；
    只有整页刷新 / 新标签页才从新会话开始。
  */

  useEffect(() => {
    if (!splitMounted) {
      setSplitExpanded(false)
      setSplitAnimating(false)
      return
    }

    /*
      从最大化返回的那一次没有起点可演（面板本来就展开着）—— 直接切到位。
      消费掉这个标记，之后用户自己开关面板时照常演。
    */
    const skipEnter = skipSplitEnterRef.current
    skipSplitEnterRef.current = false

    /*
      三种「没有过渡」的情形，直接切到位：
      - 从最大化返回（上面那条）；
      - 移动端：Split 是覆盖式（`inset-x-0`），没有宽度可动；
      - 关掉了「界面动效」（设置 → 外观），或系统要求减少动效 —— 状态照旧，只是不播
        （见 `#/lib/use-motion`）。
    */
    if (skipEnter || isMobile || !motionEnabled) {
      setSplitExpanded(open)
      setSplitAnimating(false)
      if (!open) setSplitMounted(false)
      return
    }

    if (open) {
      setSplitAnimating(true)
      // 先以 0 宽渲染一帧，下一帧再展开 —— 浏览器才有过渡起点
      const raf = requestAnimationFrame(() => setSplitExpanded(true))
      const timer = window.setTimeout(() => setSplitAnimating(false), SPLIT_SLIDE_MS)
      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(timer)
      }
    }

    // 退场：目标宽度先回 0，动画跑完再卸载
    setSplitExpanded(false)
    setSplitAnimating(true)
    const timer = window.setTimeout(() => {
      setSplitAnimating(false)
      setSplitMounted(false)
    }, SPLIT_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [open, splitMounted, isMobile])

  /** `side` 必须是**物理侧**：RTL 下面板贴在左侧，拖拽方向与方向键语义都要跟着翻。 */
  const { resizing, handleProps: resizeHandleProps } = usePanelResize({
    side: isRtl ? 'left' : 'right',
    min: AI_PANEL_MIN_WIDTH,
    max: AI_PANEL_MAX_WIDTH,
    width: panelWidth,
    onChange: setPanelWidth,
    onCommit: persistAiPanelWidth,
    panelRef,
  })

  /*
    浮窗的高度上限**分两层**：存档里的静态上限（`AI_FLOAT_MAX_HEIGHT`）与视口给的上限
    （`100svh − AI_FLOAT_VIEWPORT_MARGIN`）。浮窗贴底向上长，矮窗口里只有后者能拦住它。
    函数形态让它在每次拖动时重新求值，而不是在挂载时算一次就定死。
  */
  const resolveMaxFloatHeight = () =>
    typeof window === 'undefined'
      ? AI_FLOAT_MAX_HEIGHT
      : Math.min(AI_FLOAT_MAX_HEIGHT, window.innerHeight - AI_FLOAT_VIEWPORT_MARGIN)

  const {
    widthHandleProps: floatWidthHandleProps,
    heightHandleProps: floatHeightHandleProps,
    cornerHandleProps: floatCornerHandleProps,
  } = useFloatPanelResize({
    // `side` 是浮窗**贴的物理侧**（与分屏面板同一个约定）：LTR 贴右下角、RTL 贴左下角。
    // 手柄在它的行首边，拖拽方向与方向键语义都由这里推导 —— 别再按"忽略书写方向"算。
    side: isRtl ? 'left' : 'right',
    size: floatSize,
    minWidth: AI_FLOAT_MIN_WIDTH,
    maxWidth: AI_FLOAT_MAX_WIDTH,
    minHeight: AI_FLOAT_MIN_HEIGHT,
    maxHeight: resolveMaxFloatHeight,
    onChange: setFloatSize,
    onCommit: persistAiFloatSize,
    panelRef: floatPanelRef,
  })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // 让位给已经处理过 Esc 的更上层浮层（如命令面板、确认弹窗）：
      // 它们 preventDefault 之后，这里不应再顺手把面板也关掉。
      if (event.defaultPrevented) return
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (mode === 'float') {
    return (
      <AiFloatPanel
        open={open}
        collapsed={collapsed}
        size={floatSize}
        deforming={floatDeforming}
        onDeformEnd={() => setFloatDeforming(false)}
        skipEnter={floatSkipEnter}
        motionEnabled={motionEnabled}
        isMobile={isMobile}
        panelRef={floatPanelRef}
        resolveMaxHeight={resolveMaxFloatHeight}
        handleProps={{
          width: floatWidthHandleProps,
          height: floatHeightHandleProps,
          corner: floatCornerHandleProps,
        }}
        onClose={onClose}
        onToggleCollapsed={onToggleCollapsed}
        onMaximize={onMaximize}
        onOpenNewWindow={onOpenNewWindow}
      />
    )
  }

  /*
    Split：**退场动画期间要留在树上**，所以这里看的是 `splitMounted`（而不是 `open`）。
    它比 `open` 多活一个过渡时长，收完那一下才真正卸载。
  */
  if (!splitMounted) return null

  const isDesktopShell = isDesktop()
  const isMac = isDesktopMac()
  const desktopRoundedClass = isDesktopShell ? (isMac ? 'rounded-lg' : 'rounded-md') : ''

  return (
    <>
      <SidePanelResizeHandle
        label={t('resize', '调整面板宽度')}
        handleProps={resizeHandleProps}
        frame={SHELL_PANEL_FRAME}
      />

      <aside
        ref={panelRef}
        aria-label={t('title', 'Ask AI')}
        // 收起过程中它还在树上，但对读屏与键盘必须已经是「消失」的
        aria-hidden={open ? undefined : true}
        inert={open ? undefined : true}
        /*
          宽度就是进场 / 退场的动画本体：
          - 桌面端 `0 ↔ panelWidth` —— 面板贴行尾，宽度一变内容列跟着被推开（「推动页面」），
            同时钉住的内层从行尾外侧滑进来；
          - 移动端不写宽度（`inset-x-0` 撑满），打开 / 关闭是即时的，没有可动的宽度。
          `max-w` 是窄视口兜底（保证内容区至少 320px），被压缩时拖拽起点由实测宽度修正。
        */
        style={isMobile ? undefined : { width: splitExpanded ? panelWidth : 0 }}
        className={cn(
          'flex flex-col border-kumo-line bg-kumo-base',
          /*
            `overflow-hidden` 有两个作用，都不能省：
            - 宽度变小时裁掉「钉在最终宽度」的内层（它比外框宽，否则会溢出到面板外面）；
            - flex item 的 `min-width: auto` 在 `overflow: visible` 时是内容最小宽度，
              会把宽度动画卡在半路 —— 非 visible 的溢出把它归零，宽度才真能收到 0。
          */
          'overflow-hidden',
          // 移动端（非桌面壳）：覆盖整个视口（面板自己的头行带关闭按钮，不必露出 AppHeader）
          !isDesktopShell &&
            'fixed inset-x-0 z-30 md:sticky md:inset-x-auto md:z-20 md:shrink-0 md:max-w-[calc(100%_-_320px)]',
          // 桌面端：始终回到文档流，成为与内容区并排的一列，绝不覆盖全屏
          isDesktopShell && 'sticky inset-x-auto z-20 shrink-0 max-w-[calc(100%_-_240px)]',
          !isDesktopShell && 'md:border-s',
          desktopRoundedClass,
          /*
            展开 / 收起的宽度过渡。两处摘掉它的情形：
            - **拖拽宽度时**（`!resizing`）：否则每一帧宽度都落在 200ms 的过渡上，
              面板会滞后一大截、根本不跟手；
            - **关掉「界面动效」时**（`motionEnabled`）：用户要的就是直接切换；
              `motion-safe:` 只管系统设置，用户开关得在这里把类整体去掉。
            时长与 `SPLIT_SLIDE_MS` 同步。
          */
          !resizing &&
            motionEnabled &&
            (isDesktopShell
              ? 'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out'
              : 'md:motion-safe:transition-[width] md:motion-safe:duration-200 md:motion-safe:ease-out'),
          SHELL_PANEL_FRAME,
        )}
      >
        {/*
          内层在过渡期间**钉住最终宽度**：外框在变宽，内容是「滑」进来而不是被挤着重排
          （不钉住的话头行文字、输入框会一路抖动）。动画结束就放开，让窄视口下
          `max-w` 的压缩重新生效 —— 常驻钉死会在窄桌面把内容裁掉一截。
        */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={splitAnimating && !isMobile ? { width: panelWidth } : undefined}
        >
          <AiPanelSurface
            onClose={onClose}
            onMaximize={onMaximize}
            onOpenNewWindow={onOpenNewWindow}
          />
        </div>
      </aside>
    </>
  )
}
