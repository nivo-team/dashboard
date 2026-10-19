import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AiComposer } from '#/features/ai/components/composer'
import { AiConversationScroller } from '#/features/ai/components/conversation-scroller'
import { cn } from '#/lib/cn'
import { PanelHeader } from './header'
import { AiPermissionView } from './permission-view'

/**
 * 两种形态共用的面板骨架：头行（见 `header.tsx`）+ 可滚动内容区 + **固定在底部的输入区**。
 *
 * 头行固定 `h-[58px]` = `AppHeader` 高度，因此 Split 形态下三条横线（侧边栏品牌行、
 * 顶栏、面板头行）落在同一条底边上（**只在浏览器里成立**：桌面壳里顶栏被 44px 的窗口条
 * 取代，窗口条在外壳那一行之外，不再有可对齐的横线）；Float 是浮窗，这个高度只是顺带保持统一 ——
 * 顺带也是 Float **折叠态**的总高度（折叠 = 只留头行这一条）。
 *
 * 三段是 flex 列：头行与输入区 `shrink-0`、中间内容区 `min-h-0 flex-1 overflow-y-auto`，
 * 所以对话再长输入框也不会被顶出视口（**不要**把输入区放进滚动容器里）。
 *
 * 面板内部自己管 padding（外层容器不带），分隔线因此能通到面板两侧边缘。
 */
export function AiPanelSurface({
  onClose,
  collapsed = false,
  onToggleCollapsed,
  onMaximize,
  onOpenNewWindow,
}: {
  onClose: () => void
  /** 是否折成「只有头行」的窄条（Float 专属，Split 恒为 `false`） */
  collapsed?: boolean
  /** 折叠 / 展开的切换回调；见 `AiPanelProps.onToggleCollapsed` */
  onToggleCollapsed?: () => void
  onMaximize?: () => void
  onOpenNewWindow?: () => void
}) {
  /**
   * 面板内容当前显示什么：对话，还是权限配置。
   *
   * 权限配置**替换**整个面板内容（而不是另开弹窗 / 抽屉）：面板本身已经是一块完整的
   * 侧栏，再叠一层浮层只会多一层「我把什么东西盖住了」的疑问；替换后头行高度、
   * 分隔线、底色全部沿用同一套骨架，只在左侧换成「返回 + 标题」。
   *
   * 状态挂在 Surface 上而不是更外面：Split 与 Float 是两条渲染分支，各自渲染一个 Surface，
   * 于是「换形态」时自动回到对话（两种形态本来就不共享滚动与输入草稿）。
   */
  const [view, setView] = useState<'chat' | 'permissions'>('chat')

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
    if (view !== 'chat') return
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

  // 切到权限配置视图时清理高亮坐标与未执行的帧，避免切回对话时出现残留亮斑
  useEffect(() => {
    if (view !== 'chat') {
      if (pointerFrame.current !== null) {
        cancelAnimationFrame(pointerFrame.current)
        pointerFrame.current = null
      }
      const el = panelRootRef.current
      if (el) {
        el.style.removeProperty('--ai-pointer-x')
        el.style.removeProperty('--ai-pointer-y')
      }
    }
  }, [view])

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
        点阵背景 + 指针高亮：**只在对话视图下渲染**（含头行与输入区）。
        权限配置等视图保持干净纯色背景，避免点阵干扰阅读与表单勾选。
        `pointer-events-none` 保证它不吃任何交互。
      */}
      {view === 'chat' ? (
        <div aria-hidden className="ai-dot-grid pointer-events-none absolute inset-0">
          <div className="ai-dot-spotlight absolute inset-0" />
        </div>
      ) : null}

      <PanelHeader
        view={view}
        collapsed={collapsed}
        onBack={() => setView('chat')}
        onClose={onClose}
        onToggleCollapsed={onToggleCollapsed}
        onMaximize={onMaximize}
        onOpenNewWindow={onOpenNewWindow}
      />

      {/*
        折叠态：**只留头行**。会话区与输入区整体不渲染 —— 而不是靠 CSS 把它们压成 0 高：
        否则输入框、消息里的链接仍留在 tab 顺序里（看不见却能聚焦），
        读屏也会把整段对话读出来，而屏幕上只是一条窄条。
      */}
      {collapsed ? null : (
        <>
          {/*
            对话本体**始终挂载**，权限视图只是盖在它上面（`hidden`）——
            卸载会话区会丢掉滚动位置、还会让 `AiConversationScroller` 重新走一次会话加载，
            而权限视图只是一次「临时去改个设置」的往返，不该把对话归零。
            `hidden`（display:none）同时把里面的链接、输入框移出 tab 顺序。
          */}
          <div className={cn('flex min-h-0 flex-1 flex-col', view === 'permissions' && 'hidden')}>
            {/*
              会话区：消息、空态、工具执行态、审批卡，以及「跟随滚动 / 回到底部」都在
              `AiConversationScroller` 里 —— 那是**与全屏对话页共用**的一份，
              两处的滚动行为因此必然一致。这里只把点阵背景压住（`z-10`）。
            */}
            <AiConversationScroller className="z-10" />

            <div className="relative z-10 shrink-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              {/*
                「配置权限」入口只在**面板**给：全屏对话页的输入框不传这个回调 ——
                那一页没有可替换的面板内容，改权限仍走设置页。
              */}
              <AiComposer onConfigurePermissions={() => setView('permissions')} />
            </div>
          </div>

          {view === 'permissions' ? <AiPermissionView onDone={() => setView('chat')} /> : null}
        </>
      )}
    </div>
  )
}
