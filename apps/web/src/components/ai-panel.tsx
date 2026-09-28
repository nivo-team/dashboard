import { Button, Tooltip } from '@cloudflare/kumo'
import {
  ArrowsOutSimpleIcon,
  CaretDownIcon,
  CaretUpIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/components/ai-bot-avatar'
import { AiComposer } from '#/components/ai-composer'
import { AiConversationScroller } from '#/components/ai-conversation-scroller'
import { AiSessionPicker, useActiveSessionTitle } from '#/components/ai-session-picker'
import {
  SHELL_PANEL_FRAME,
  SidePanelResizeHandle,
} from '#/components/side-panel'
import { useAiSessionStore } from '#/lib/ai'
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
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useLocale } from '#/lib/use-locale'
import {
  useFloatPanelResize,
  usePanelResize,
  type FloatResizeHandleProps as FloatResizeHandleBinderProps,
} from '#/lib/use-panel-resize'

/**
 * Split 形态展开 / 收起的时长（ms）。
 *
 * **必须与 `aside` 上的 `duration-200` 一致**：过渡是 CSS 跑的，而「什么时候可以卸载」
 * 只能由 JS 计时（过渡被打断 / 减动效时 `transitionend` 不会来）。两者分叉的症状是
 * 收起后残留一小会儿（或提前被砍掉）。
 */
const SPLIT_SLIDE_MS = 200

/** 系统是否要求「减少动效」（与 styles.css 里那些 `prefers-reduced-motion` 媒体查询同义）。 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

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
}

/**
 * AI 面板：「Ask AI」按钮对应的那块界面，两种打开方式共用同一个内部骨架。
 *
 * 形态由 设置 → AI（`/settings/AI`）的 `admin.preferences:<appId>.aiPanelMode` 决定：
 *
 * - **Split View**（`split`）：外壳级的一整列，与 `Sidebar` **同级**（`SHELL_PANEL_FRAME`
 *   就是 styles.css 给侧边栏的那套 `sticky top-0 h-svh`）—— 从视口顶端齐平开始、
 *   整屏高，夹在侧边栏与内容区之间，挤压内容而不覆盖它。它挂载在
 *   `Sidebar.Provider` 内容列**之后的兄弟节点**上（见 components/app-shell.tsx），
 *   内部头行固定 `h-[58px]` 与 `AppHeader` 同高，两条底边线连成一条。
 *   **进场 / 退场是「宽度 0 ↔ panelWidth」的过渡**：面板贴行尾，宽度一变就把内容列推开
 *   （推动页面），内层钉住最终宽度因而读起来是「从行尾侧滑进来」而不是被挤开；
 *   退场期间面板仍需留在树上等动画跑完，所以开关是三段式状态（`splitMounted` /
 *   `splitExpanded` / `splitAnimating`，见组件里的注释）；
 * - **Float**（`float`）：**从页面底部升起**的浮窗，停在**行尾侧下角**（LTR 右下、RTL 左下）、
 *   浮在内容之上（`fixed`，不挤压布局）。入场动画是「自下而上 + 淡入」，交给 styles.css 的
 *   `[data-ai-float='true']` 规则（`prefers-reduced-motion: reduce` 下不播、状态照常）。
 *   它是**可拖拽改变尺寸**的小窗：顶边改高度、行首边改宽度、行首上角同时改两者
 *   （手柄见文件末尾的 `AiFloatResizeHandle`，逻辑在 `#/lib/use-panel-resize`）；
 *   头行的折叠按钮还能把它压成**只有头行**的窄条（`collapsed`，受控于 `AppShell`）。
 *
 * 两处的降级：
 * - **移动端**：Split 退化成覆盖整屏的面板（没有可动的宽度，进 / 退场即时切换）、
 *   Float 也收成整屏 —— 窄屏放不下并列两列，差异只剩尺寸与位置。Float 的
 *   **位置 / 圆角 / 边框 / 阴影**用 `md:` 类表达，**尺寸**（宽高来自 store，
 *   写不出静态类）则用同一断点的 `isMobile` 兜住：移动端不写内联 style、也不挂拖柄；
 * - **Esc 关闭**：面板没有遮罩可以点，键盘退出只能自己接（会让位给已处理 Esc 的上层浮层）。
 *
 * 尺寸都落在 `admin.shell-ui`（与详情面板 / 侧边栏同源）：拖动中的即时值放本地 state，
 * 松手 / 键盘调整才由 `onCommit` 落盘 —— 与 `detail-preview` 完全一致的理由
 * （每帧写 localStorage 会卡，给 store 加节流又会让面板滞后）。
 * Split 只有宽度（`aiPanelWidth`），Float 是宽 + 高（`aiFloatWidth` / `aiFloatHeight`）。
 */
export function AiPanel({ open, onClose, collapsed = false, onToggleCollapsed, onMaximize }: AiPanelProps) {
  const { t } = useTranslation('ai')
  const { isRtl } = useLocale()
  const isMobile = useIsMobileViewport()
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
   * Split 形态的两段式开关（Float 不需要：它只有入场动画，关闭即卸载）。
   *
   * - `splitMounted`：在不在树上 —— **退场动画期间必须留在树上**，否则宽度还没收回就没了；
   * - `splitExpanded`：宽度的目标值。宽度 0 ↔ `panelWidth` 既是「推动内容」，也是
   *   「从行尾侧滑进来」（面板贴行尾，宽度一变，内容列跟着被推开）；
   * - `splitAnimating`：过渡窗口内为真，用来把内层**钉在最终宽度**上 ——
   *   否则动画期间内容是「被挤着重排」（文字不停换行）而不是「滑进来」。
   */
  const [splitMounted, setSplitMounted] = useState(false)
  const [splitExpanded, setSplitExpanded] = useState(false)
  const [splitAnimating, setSplitAnimating] = useState(false)

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
    （`#/lib/ai/session-boot` 的 `isDocumentReload`）加上设置里的「新会话时机」。
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
      两种「没有过渡」的情形，直接切到位：
      - 移动端：Split 是覆盖式（`inset-x-0`），没有宽度可动；
      - 系统要求减少动效：状态照旧，只是不播（与 styles.css 里各处媒体查询同义）。
    */
    if (isMobile || prefersReducedMotion()) {
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
    /*
      Float **关闭即卸载**（只有入场动画，没有退场 —— 见 styles.css 的
      `[data-ai-float='true']`）：浮窗是浮层，消失不需要为它多留一帧。
    */
    if (!open) return null

    /*
      折叠只在桌面端成立：移动端浮窗是**整屏**（`inset-0` 会把没有高度的盒子照样撑满），
      「只留一条」在那儿既画不出来也没意义。所以这里统一取「桌面端 + 已折叠」，
      折叠按钮也只在桌面端挂 —— 状态本身保留着，窗口变宽回来仍是折叠的。
    */
    const isCollapsed = !isMobile && collapsed

    return (
      <aside
        ref={floatPanelRef}
        data-ai-float="true"
        aria-label={t('title', 'Ask AI')}
        /*
          尺寸是**数据**（存档 / 拖拽的即时值），不是样式，所以走内联 style。
          `maxHeight` 与 hook 的拖拽上限同源（同一个 `AI_FLOAT_VIEWPORT_MARGIN`），
          视口变矮时把浮窗压回视口内 —— 两处一旦分叉，拖到上限时面板会先停住、
          再被 CSS 悄悄压小。

          折叠态与展开态的尺寸是**两回事**：
          - 折叠：宽度直接取**最小宽度**（一条窄条，够放头像 + 标题 + 两个按钮），
            不写 `height` —— 高度交给内容（只剩头行那一条）；
          - 展开：回到 `floatSize`（存档 / 拖拽出来的宽 + 高）。

          折叠期间**不碰 `floatSize`、也不落盘**（手柄在折叠态根本不挂，见下）：
          所以 `aiFloatWidth` / `aiFloatHeight` 里留的始终是「上一次展开时的尺寸」，
          展开即恢复；关掉面板再打开也是这个尺寸。
        */
        style={
          isMobile
            ? undefined
            : isCollapsed
              ? { width: AI_FLOAT_MIN_WIDTH }
              : {
                  width: floatSize.width,
                  height: floatSize.height,
                  maxHeight: `calc(100svh - ${AI_FLOAT_VIEWPORT_MARGIN}px)`,
                }
        }
        className={cn(
          'fixed z-30 flex flex-col overflow-hidden bg-kumo-base',
          /*
            移动端：**整屏**（`inset-0`），不做"贴底卡片"。

            手机屏幕本来就小，卡片式再砍掉一截高度、左右还各留 12px，
            真正能看内容的地方所剩无几。全屏之后与 Split View 在移动端的行为也统一了
            —— 桌面端那两个形态的差别（挤压内容 vs 浮在内容上）在手机上本来就读不出来，
            留在那儿的只有"更小的可用面积"。

            圆角 / 边框 / 阴影同理下放到 `md:`：整屏面板的边缘就是屏幕边缘。
          */
          'inset-0',
          /*
            桌面端：**行尾侧下角**的小窗 —— LTR 右下、RTL 左下（`start` / `end` 是逻辑属性，
            方向自己就会翻）。尺寸由上面的内联 style 给，这里只管贴哪一角。

            ⚠️ `md:top-auto` **不能省**：`inset-0` 写进去的 `top: 0` 不会被 `md:bottom-4`
            顶掉 —— top / bottom / height 同时指定时浏览器忽略的是 bottom，
            于是浮窗会贴到**视口顶端**（而且照样带 560px 高，看起来像"从左上角弹出来"）。
          */
          'md:top-auto md:start-auto md:end-4 md:bottom-4',
          'md:rounded-xl md:border md:border-kumo-line md:shadow-lg',
        )}
      >
        <AiPanelSurface
          onClose={onClose}
          collapsed={isCollapsed}
          // 移动端不挂折叠按钮（`isCollapsed` 恒为 false，两者的判断保持一致）
          onToggleCollapsed={isMobile ? undefined : onToggleCollapsed}
          onMaximize={onMaximize}
        />

        {/*
          尺寸手柄只在桌面端挂：移动端浮窗是整屏，没有可拖的尺寸。
          手柄是浮窗**内部**的绝对定位热区，顺序放在内容之后、靠 `z-20` 压在上面；
          它们**不画任何常驻 / hover 视觉**（连角上也不放图标），提示只在鼠标样式上。

          **折叠态三个手柄一个都不挂**：窄条的宽就是最小宽度、高就是头行，拖它没有意义；
          更重要的是拖拽会在 `onCommit` 里落盘，而折叠期间的尺寸**不该污染存档** ——
          存档要留着「上次展开时的宽高」，展开才能原样恢复（见上面的 style 注释）。
        */}
        {isMobile || isCollapsed ? null : (
          <>
            {/* 顶边：只改高度 */}
            <AiFloatResizeHandle
              label={t('resizeFloatHeight', '调整浮窗高度')}
              orientation="horizontal"
              valueNow={floatSize.height}
              valueMin={AI_FLOAT_MIN_HEIGHT}
              valueMax={resolveMaxFloatHeight()}
              handleProps={floatHeightHandleProps}
              className="inset-x-0 top-0 h-1.5 cursor-ns-resize"
              focusLineClassName="inset-x-0 my-auto h-0.5"
            />
            {/* 行首边：只改宽度 */}
            <AiFloatResizeHandle
              label={t('resizeFloatWidth', '调整浮窗宽度')}
              orientation="vertical"
              valueNow={floatSize.width}
              valueMin={AI_FLOAT_MIN_WIDTH}
              valueMax={AI_FLOAT_MAX_WIDTH}
              handleProps={floatWidthHandleProps}
              className="inset-y-0 start-0 w-1.5 cursor-ew-resize"
              focusLineClassName="inset-y-0 mx-auto w-0.5"
            />
            {/* 行首上角：同时改宽高（对角光标在 RTL 下镜像成 `nesw`） */}
            <AiFloatResizeHandle
              label={t('resizeFloat', '调整浮窗大小')}
              handleProps={floatCornerHandleProps}
              className="start-0 top-0 size-3 cursor-nwse-resize rtl:cursor-nesw-resize"
              focusLineClassName="start-1 top-1 size-1.5 rounded-full"
            />
          </>
        )}
      </aside>
    )
  }

  /*
    Split：**退场动画期间要留在树上**，所以这里看的是 `splitMounted`（而不是 `open`）。
    它比 `open` 多活一个过渡时长，收完那一下才真正卸载。
  */
  if (!splitMounted) return null

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
          // 移动端：覆盖整个视口（面板自己的头行带关闭按钮，不必露出 AppHeader）
          'fixed inset-x-0 z-30',
          // 桌面端：回到文档流，成为 Sidebar 同级的一列 —— 贴行尾、整屏高、只留一条分隔线。
          // `z-20` 与 styles.css 给侧边栏的层级一致（两者同为外壳级，不该有高低之分）。
          'md:sticky md:inset-x-auto md:z-20 md:shrink-0 md:max-w-[calc(100%_-_320px)] md:border-s',
          /*
            展开 / 收起的宽度过渡。**拖拽宽度时必须摘掉**（`!resizing`）：否则每一帧
            宽度都落在 200ms 的过渡上，面板会滞后一大截、根本不跟手。
            时长与 `SPLIT_SLIDE_MS` 同步。
          */
          !resizing &&
            'md:motion-safe:transition-[width] md:motion-safe:duration-200 md:motion-safe:ease-out',
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
          <AiPanelSurface onClose={onClose} onMaximize={onMaximize} />
        </div>
      </aside>
    </>
  )
}

/**
 * 两种形态共用的面板骨架：头行（标题 + 关闭）+ 可滚动内容区 + **固定在底部的输入区**。
 *
 * 头行固定 `h-[58px]` = `AppHeader` 高度，因此 Split 形态下三条横线（侧边栏品牌行、
 * 顶栏、面板头行）落在同一条底边上；Float 是浮窗，这个高度只是顺带保持统一 ——
 * 顺带也是 Float **折叠态**的总高度（折叠 = 只留头行这一条）。
 *
 * 三段是 flex 列：头行与输入区 `shrink-0`、中间内容区 `min-h-0 flex-1 overflow-y-auto`，
 * 所以对话再长输入框也不会被顶出视口（**不要**把输入区放进滚动容器里）。
 *
 * 面板内部自己管 padding（外层容器不带），分隔线因此能通到面板两侧边缘。
 */
function AiPanelSurface({
  onClose,
  collapsed = false,
  onToggleCollapsed,
  onMaximize,
}: {
  onClose: () => void
  /** 是否折成「只有头行」的窄条（Float 专属，Split 恒为 `false`） */
  collapsed?: boolean
  /**
   * 折叠 / 展开的切换回调。
   *
   * **只有 Float 传**：不传就没有那颗按钮 —— 所以「折叠按钮只在 float 模式出现」
   * 不是靠 mode 判断，而是靠这个回调的有无（Split 传不了，也不该传）。
   */
  onToggleCollapsed?: () => void
  /** 「最大化」跳到全屏对话页（见 `AiPanelProps.onMaximize`）；不传则没有那颗按钮 */
  onMaximize?: () => void
}) {
  const { t } = useTranslation('ai')
  const activeSessionTitle = useActiveSessionTitle()
  /** 头行「新对话」快捷按钮：直接开一段新会话，不必先点开会话选择器 */
  const startNewSession = useAiSessionStore((state) => state.startNewSession)

  /*
    指针高亮：把坐标写进 CSS 变量，由背景层（`.ai-dot-spotlight`）自己裁。

    两处讲究：
    - 用 `rAF` 节流 —— `pointermove` 一秒能来上百次，每帧最多更新一次就足够顺滑；
      少了这一层，浏览器会为每次移动重绘整块背景；
    - 坐标用**容器的 rect** 算，不用 `offsetX/offsetY`：后者是相对**事件目标**的，
      指针移到会话里的消息、卡片上时会突然变成那些元素的局部坐标（高亮跟着乱跳）。
  */
  const panelRootRef = useRef<HTMLDivElement | null>(null)
  const pointerFrame = useRef<number | null>(null)
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { clientX, clientY } = event
    if (pointerFrame.current !== null) return
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = null
      const el = panelRootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--ai-pointer-x', `${clientX - rect.left}px`)
      el.style.setProperty('--ai-pointer-y', `${clientY - rect.top}px`)
    })
  }

  /*
    指针离开面板就**直接收起高亮**：把坐标挪回 CSS 的默认值（`-999px`），
    mask 跟着移到视口外，高亮就没了。不做这一步的话坐标会停在最后的位置，
    高亮留在原地，看起来像块污渍。

    两个细节：
    - 先取消已排队的那一帧 —— 否则它会在这之后又把坐标写回来，高亮闪一下才消失；
    - 用 `removeProperty` 而不是手动写回 `-999px`：默认值只留在 CSS 一处，
      以后想改「隐藏时的位置」不用动这里。
  */
  const handlePointerLeave = () => {
    if (pointerFrame.current !== null) {
      cancelAnimationFrame(pointerFrame.current)
      pointerFrame.current = null
    }
    const el = panelRootRef.current
    if (!el) return
    el.style.removeProperty('--ai-pointer-x')
    el.style.removeProperty('--ai-pointer-y')
  }

  // 卸载时把没跑完的那帧取消，别让回调去碰已经不在的元素
  useEffect(
    () => () => {
      if (pointerFrame.current !== null) cancelAnimationFrame(pointerFrame.current)
    },
    [],
  )

  return (
    <div
      ref={panelRootRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {/*
        点阵背景 + 指针高亮：**铺满整个面板**（含头行与输入区），所以它是一层独立的
        装饰层压在内容之下 —— 下面各段因此都要 `relative`，否则会被这层盖住。
        `pointer-events-none` 保证它不吃任何交互。
      */}
      <div aria-hidden className="ai-dot-grid pointer-events-none absolute inset-0">
        <div className="ai-dot-spotlight absolute inset-0" />
      </div>
      {/*
        头行左侧是**会话选择器**（替换掉原来的静态标题「Ask AI」）：点开可搜索历史会话、
        切换、开新对话。`px-2` 而不是 `px-4` —— 选择器按钮自带 `px-2`，
        这样它的文字与下面的会话内容仍然对齐在 16px 上。
        折叠态这里换成「AI 头像 + 当前会话标题」（不可点，见下）。
      */}
      {/*
        头行要**自己的底色**：点阵背景铺满了整个面板，不给底色它就会从这后面透出来。
        取与面板相同的 `bg-kumo-base` 而不是另找一个色 —— 与 Cloudflare 面板一致：
        头行与内容区靠**一条分隔线**区分，不靠色差。
        折叠态没有下半部分，那条底边线要收掉 —— 否则贴着浮窗下沿的一条线像是没画完。
      */}
      <header
        className={cn(
          'relative z-10 flex h-[58px] shrink-0 items-center justify-between gap-2 bg-kumo-base px-2',
          collapsed ? 'border-b-0' : 'border-b border-kumo-line',
        )}
      >
        {collapsed ? (
          /*
            折叠态：会话选择器换成「AI 头像 + 当前会话标题」，两者与展开时**同源**
            （`useActiveSessionTitle`）—— 折起来之后仍能认出是哪一段对话。
            头像**不加底**（没有圆形底色 / 描边），与消息行里的那个一致：一条窄条上，
            多一层底只是多一笔视觉噪音。
            这里刻意不再可点：窄条上开浮层会把选择器顶出去，想换会话就展开面板。
          */
          <div className="flex min-w-0 items-center gap-2">
            <AiBotAvatar size={24} className="shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium text-kumo-default">
              {activeSessionTitle}
            </span>
          </div>
        ) : (
          <AiSessionPicker />
        )}

        {/*
          动作区：新对话 + 最大化（跳到全屏对话页）+ 折叠（只有 Float 有）+ 关闭。
          顺序上越靠近内容，越是「与当前这段对话有关」的动作：新对话在最前，
          关闭在最后。RTL 下由 flex 自己镜像到另一侧。

          **折叠态只留「展开」与「关闭」**：一条窄条上塞四颗按钮既挤又吵，而新对话 /
          最大化本来就得先看见内容才有意义 —— 想用先展开。
        */}
        <div className="flex shrink-0 items-center gap-1">
          {/*
            「新对话」快捷按钮：会话选择器浮层里本来也有一个，但那是「点开 → 再点一下」；
            开新对话是高频动作，头行留一颗直给。
          */}
          {collapsed ? null : (
            <Tooltip
              content={t('sessionNew', '新对话')}
              className="cursor-pointer"
              render={
                <Button
                  variant="ghost"
                  shape="square"
                  onClick={startNewSession}
                  aria-label={t('sessionNew', '新对话')}
                />
              }
            >
              <PlusIcon size={16} />
            </Tooltip>
          )}

          {!collapsed && onMaximize ? (
            <Tooltip
              content={t('maximizeTooltip', '在全屏对话中打开')}
              className="cursor-pointer"
              render={
                <Button
                  variant="ghost"
                  shape="square"
                  onClick={onMaximize}
                  aria-label={t('maximize', '最大化')}
                />
              }
            >
              {/*
                `ArrowsOutSimple`（四角向外的双箭头）是**中心对称**图标，
                不随书写方向翻转，所以**不加 `rtl-flip`**。
              */}
              <ArrowsOutSimpleIcon size={16} />
            </Tooltip>
          ) : null}

          {onToggleCollapsed ? (
            <Tooltip
              content={
                collapsed
                  ? t('expandTooltip', '展开对话')
                  : t('collapseTooltip', '收起对话，只留标题栏')
              }
              // Kumo 会给 trigger 补一个 `cursor-default`，按钮要的是手型
              className="cursor-pointer"
              render={
                <Button
                  variant="ghost"
                  shape="square"
                  onClick={onToggleCollapsed}
                  // 折叠按钮是开关：读屏要能听出「现在是展开还是收起」
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? t('expand', '展开对话') : t('collapse', '收起对话')}
                />
              }
            >
              {/*
                `CaretDown` = 收起（把对话往下压扁）、`CaretUp` = 展开。
                上下向图标不随书写方向翻转，所以**不加 `rtl-flip`**。
              */}
              {collapsed ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
            </Tooltip>
          ) : null}

          <Tooltip
            content={t('close', '关闭面板')}
            className="cursor-pointer"
            render={
              <Button
                variant="ghost"
                shape="square"
                onClick={onClose}
                aria-label={t('close', '关闭面板')}
              />
            }
          >
            <XIcon size={16} />
          </Tooltip>
        </div>
      </header>

      {/*
        折叠态：**只留头行**。会话区与输入区整体不渲染 —— 而不是靠 CSS 把它们压成 0 高：
        否则输入框、消息里的链接仍留在 tab 顺序里（看不见却能聚焦），
        读屏也会把整段对话读出来，而屏幕上只是一条窄条。
      */}
      {collapsed ? null : (
        <>
          {/*
            会话区：消息、空态、工具执行态、审批卡，以及「跟随滚动 / 回到底部」都在
            `AiConversationScroller` 里 —— 那是**与全屏对话页共用**的一份，
            两处的滚动行为因此必然一致。这里只把点阵背景压住（`z-10`）。
          */}
          <AiConversationScroller className="z-10" />

          <div className="relative z-10 shrink-0 p-3">
            <AiComposer />
          </div>
        </>
      )}
    </div>
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
  handleProps: FloatResizeHandleBinderProps
  /** 热区的位置 / 大小 / 光标（绝对定位，相对浮窗） */
  className: string
  /**
   * **键盘焦点**提示线的几何（绝对定位 + 尺寸 / 位置）——
   * 鼠标怎么划都不会出现，只在 `:focus-visible`（Tab 进来）时显形。
   */
  focusLineClassName: string
}

/**
 * 浮窗（Float）的尺寸手柄。
 *
 * 不用 CSS 的 `resize: both`：它只能改右下角、不跟 RTL、`overflow-hidden` 下不出现，
 * 而且完全不支持键盘（读屏与键盘用户就彻底改不了尺寸）。这里用最朴素的做法 ——
 * 三条绝对定位的透明热区：顶边（改高）、行首边（改宽）、行首上角（两个都改）。
 *
 * **刻意不画任何常驻 / hover 视觉**：提示只在**鼠标样式**上（`ns-resize` /
 * `ew-resize` / 对角）。之前 hover 浮出的细线、角上那段直角，都会在浮窗边缘"多出一笔"
 * 干扰阅读，而此刻光标已经说明了一切 —— 所以一律去掉（拖拽期间同样不画）。
 * 只保留键盘焦点的细线：没有它，Tab 到某个手柄的键盘用户不知道自己在哪。
 *
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
