import { Button } from '@cloudflare/kumo'
import { ArrowDownIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AiComposer } from '#/components/ai-composer'
import { AiConversation } from '#/components/ai-conversation'
import { AiSessionPicker } from '#/components/ai-session-picker'
import {
  SHELL_PANEL_FRAME,
  SidePanelResizeHandle,
} from '#/components/side-panel'
import { useAiSessionStore } from '#/lib/ai'
import { cn } from '#/lib/cn'
import {
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  persistAiPanelWidth,
  usePreferencesStore,
  useShellUiStore,
} from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useLocale } from '#/lib/use-locale'
import { usePanelResize } from '#/lib/use-panel-resize'

export interface AiPanelProps {
  /** 是否展开 */
  open: boolean
  /** 请求关闭（关闭按钮 / Esc） */
  onClose: () => void
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
 *   内部头行固定 `h-[58px]` 与 `AppHeader` 同高，两条底边线连成一条；
 * - **Float**（`float`）：**从页面底部弹出**的浮窗，停在行尾侧下角、浮在内容之上
 *   （`fixed`，不挤压布局）。入场动画是「自下而上 + 淡入」，交给 styles.css 的
 *   `[data-ai-float='true']` 规则（`prefers-reduced-motion: reduce` 下不播、状态照常）。
 *
 * 两处的降级：
 * - **移动端**：Split 退化成覆盖整屏的面板、Float 收成贴底的大卡片 —— 窄屏放不下并列两列，
 *   差异只剩尺寸与位置；Float 的固定宽度类只在 `md` 以上生效，因此不需要 JS 判断视口；
 * - **Esc 关闭**：面板没有遮罩可以点，键盘退出只能自己接（会让位给已处理 Esc 的上层浮层）。
 *
 * 宽度只属于 Split（`admin.shell-ui.aiPanelWidth`，与详情面板同源）：拖动中的即时值放
 * 本地 state，松手 / 键盘调整才由 `onCommit` 落盘 —— 与 `detail-preview` 完全一致的理由
 * （每帧写 localStorage 会卡，给 store 加节流又会让面板滞后）。Float 是固定尺寸的浮窗，
 * 没有可拖拽的宽度。
 */
export function AiPanel({ open, onClose }: AiPanelProps) {
  const { t } = useTranslation('ai')
  const { isRtl } = useLocale()
  const isMobile = useIsMobileViewport()
  const mode = usePreferencesStore((state) => state.aiPanelMode)

  const storedPanelWidth = useShellUiStore((state) => state.aiPanelWidth)
  const [panelWidth, setPanelWidth] = useState(storedPanelWidth)
  const panelRef = useRef<HTMLElement | null>(null)

  /** store 变化（其它标签页拖动、或存档水合）时把即时值拉平 */
  useEffect(() => {
    setPanelWidth(storedPanelWidth)
  }, [storedPanelWidth])

  /** `side` 必须是**物理侧**：RTL 下面板贴在左侧，拖拽方向与方向键语义都要跟着翻。 */
  const { handleProps: resizeHandleProps } = usePanelResize({
    side: isRtl ? 'left' : 'right',
    min: AI_PANEL_MIN_WIDTH,
    max: AI_PANEL_MAX_WIDTH,
    width: panelWidth,
    onChange: setPanelWidth,
    onCommit: persistAiPanelWidth,
    panelRef,
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

  if (!open) return null

  if (mode === 'float') {
    return (
      <aside
        data-ai-float="true"
        aria-label={t('title', 'Ask AI')}
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
          // 桌面端：行尾侧下角的小窗；固定 380px 宽 + 高度上限，视口矮时不会顶到顶栏
          'md:start-auto md:end-4 md:bottom-4 md:h-[560px] md:max-h-[calc(100svh-5rem)] md:w-[380px]',
          'md:rounded-xl md:border md:border-kumo-line md:shadow-lg',
        )}
      >
        <AiPanelSurface onClose={onClose} />
      </aside>
    )
  }

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
        // 宽度只给桌面端：移动端由 `inset-x-0` 撑满，内联 px 宽度会把它顶掉。
        // `max-w` 是窄视口兜底（保证内容区至少 320px），被压缩时拖拽起点由实测宽度修正。
        style={isMobile ? undefined : { width: panelWidth }}
        className={cn(
          'flex flex-col border-kumo-line bg-kumo-base',
          // 移动端：覆盖整个视口（面板自己的头行带关闭按钮，不必露出 AppHeader）
          'fixed inset-x-0 z-30',
          // 桌面端：回到文档流，成为 Sidebar 同级的一列 —— 贴行尾、整屏高、只留一条分隔线。
          // `z-20` 与 styles.css 给侧边栏的层级一致（两者同为外壳级，不该有高低之分）。
          'md:sticky md:inset-x-auto md:z-20 md:shrink-0 md:max-w-[calc(100%_-_320px)] md:border-s',
          SHELL_PANEL_FRAME,
        )}
      >
        <AiPanelSurface onClose={onClose} />
      </aside>
    </>
  )
}

/**
 * 两种形态共用的面板骨架：头行（标题 + 关闭）+ 可滚动内容区 + **固定在底部的输入区**。
 *
 * 头行固定 `h-[58px]` = `AppHeader` 高度，因此 Split 形态下三条横线（侧边栏品牌行、
 * 顶栏、面板头行）落在同一条底边上；Float 是浮窗，这个高度只是顺带保持统一。
 *
 * 三段是 flex 列：头行与输入区 `shrink-0`、中间内容区 `min-h-0 flex-1 overflow-y-auto`，
 * 所以对话再长输入框也不会被顶出视口（**不要**把输入区放进滚动容器里）。
 *
 * 面板内部自己管 padding（外层容器不带），分隔线因此能通到面板两侧边缘。
 */
function AiPanelSurface({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('ai')
  const autoScroll = usePreferencesStore((state) => state.aiAutoScroll)
  // 新消息、流式增量、工具卡片出现都会改动 messages，跟滚只需盯它（status 是保险）
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)

  const scrollRef = useRef<HTMLDivElement | null>(null)
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
  /*
    「此刻还贴着底吗」——**独立于设置项**的运行时状态：
    设置项管的是「默认跟不跟」，它管的是「此刻让不让」。

    用户手动往上翻时必须暂停跟滚，否则每来一个增量都会把他拽回底部，历史根本没法读；
    滚回底部（阈值内）自动恢复。
  */
  const [pinnedToBottom, setPinnedToBottom] = useState(true)

  // 内容或状态一变就贴底（前提：设置开着、且用户没有主动上翻）
  useEffect(() => {
    if (!autoScroll || !pinnedToBottom) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, status, autoScroll, pinnedToBottom])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // 32px 容差：亚像素高度、以及"差一点点就算贴底"的抖动都落在里面
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setPinnedToBottom(distance < 32)
  }

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      // 尊重系统的「减少动效」：不该为一个回滚按钮硬播一段动画
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
    setPinnedToBottom(true)
  }

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
      */}
      {/*
        头行要**自己的底色**：点阵背景铺满了整个面板，不给底色它就会从这后面透出来。
        取与面板相同的 `bg-kumo-base` 而不是另找一个色 —— 与 Cloudflare 面板一致：
        头行与内容区靠**一条分隔线**区分，不靠色差。
      */}
      <header className="relative z-10 flex h-[58px] shrink-0 items-center justify-between gap-2 border-b border-kumo-line bg-kumo-base px-2">
        <AiSessionPicker />

        <Button
          variant="ghost"
          shape="square"
          onClick={onClose}
          aria-label={t('close', '关闭面板')}
        >
          <XIcon size={16} />
        </Button>
      </header>

      {/*
        会话区：消息、工具执行态、空态与「还没配模型」的引导都在 `AiConversation` 里。
        这里只负责给它一块可滚动的容器 —— 消息再长也不会把下面的输入框顶走。
      */}
      {/*
        滚动区外面包一层 `relative`：好让「回到底部」按钮**居中浮在它的下缘**。
        按钮层用 `pointer-events-none` + 按钮自身 `pointer-events-auto` ——
        否则这层透明遮罩会拦住下面的消息（消息里的链接就点不到了）。
      */}
      <div className="relative z-10 min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto"
        >
          <AiConversation />
        </div>

        {/* 只在**没贴底**时出现：贴底时它既没用、又盖住最后一行内容 */}
        {!pinnedToBottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToBottom}
              className="pointer-events-auto shadow-md"
            >
              <ArrowDownIcon size={14} />
              {t('scrollToBottom', '回到底部')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="relative z-10 shrink-0 p-3">
        <AiComposer />
      </div>
    </div>
  )
}
