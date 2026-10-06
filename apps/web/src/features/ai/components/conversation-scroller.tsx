import { Button } from '@cloudflare/kumo'
import { ArrowDownIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiConversation } from '#/features/ai/components/conversation'
import { useAiSessionStore, type AiSurface } from '#/features/ai/core'
import { cn } from '#/lib/cn'
import { usePreferencesStore } from '#/lib/store'

/**
 * 会话区滚动容器：**AI 面板与全屏对话页共用同一份**。
 *
 * 抽出来是因为这两处的滚动行为必须完全一致（用户明确要求「功能保持一致」）：
 * 跟随滚动、用户手动上翻就暂停、回到底部按钮。各写一份必然漂移 —— 面板那套
 * 已经是踩过坑的版本（见下），复制第二份只会把坑复制一遍。
 *
 * 行为要点：
 * - **跟滚看设置**（`aiAutoScroll`）**也看此刻**（`pinnedToBottom`）：设置项管「默认跟不跟」，
 *   运行时状态管「此刻让不让」。用户手动往上翻时必须暂停，否则每来一个流式增量都会把他
 *   拽回底部，历史根本没法读；滚回底部（32px 阈值内）自动恢复。
 * - **回到底部按钮只在没贴底时出现**：贴底时它既没用、又盖住最后一行内容；
 *   浮层用 `pointer-events-none` + 按钮自身 `pointer-events-auto`，否则这层透明遮罩
 *   会拦住下面的消息（消息里的链接就点不到了）。
 * - **回滚尊重「减少动效」**：不该为一个回滚按钮硬播一段动画。
 * - `<AiConversation>` 自己管消息渲染与三种空态；这里只给它一块可滚动的容器。
 *   外层 `relative` 是为了让按钮居中浮在它的下缘。
 */
export function AiConversationScroller({
  className,
  manageHistory = true,
  contentClassName,
  stableScrollbarGutter = false,
  surface = 'panel',
}: {
  /** 容器额外类名（面板里要 `z-10` 压住点阵背景） */
  className?: string
  /** 透传给 `AiConversation`：全屏对话页的会话由路由决定，传 `false` */
  manageHistory?: boolean
  /** 容器形态（面板还是全屏） */
  surface?: AiSurface
  /**
   * 贴在**滚动内容外层**的类名。
   *
   * 宽度约束必须放在这里而不是最外层容器上：滚动容器一旦被收窄，滚动条就跟着跑到
   * 收窄后的那条边上（限宽居中时等于跑到了面板中间）。留在外层铺满，滚动条才始终
   * 贴在面板边缘 —— 收窄的是里面的内容。
   */
  contentClassName?: string
  /**
   * 给滚动条**两边**预留固定槽位（`scrollbar-gutter: stable both-edges`）。
   *
   * 两个作用，缺一不可：
   * - 出现 / 消失滚动条时内容不再左右跳动（stable）；
   * - 槽位对称，内容中心与**不滚动**的兄弟元素（输入区）始终对在同一根中轴上
   *   （只预留一边的话，滚动条一出现内容就整体偏半个滚动条宽）。
   *
   * 只在需要「限宽居中」的全屏对话页打开：那里内容居中，偏差看得出来；
   * 面板内容本来就铺满，白留两边槽位反而变窄。浏览器不支持时该属性被忽略，
   * 退化成「滚动条出现时内容轻微偏移」，不影响可用性。
   */
  stableScrollbarGutter?: boolean
}) {
  const { t } = useTranslation('ai')
  const autoScroll = usePreferencesStore((state) => state.aiAutoScroll)
  // 新消息、流式增量、工具卡片出现都会改动 messages，跟滚只需盯它（status 是保险）
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)

  // 内容或状态一变就贴底（前提：设置开着、且用户没有主动上翻）。
  // 采用 requestAnimationFrame 调度，去重高频触发并杜绝强制同步布局（Layout Thrashing）。
  useEffect(() => {
    if (!autoScroll || !pinnedToBottom) return
    const element = scrollRef.current
    if (!element) return

    const rafId = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(rafId)
  }, [messages, status, autoScroll, pinnedToBottom])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    // 32px 容差：亚像素高度、以及"差一点点就算贴底"的抖动都落在里面
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setPinnedToBottom(distance < 32)
  }

  const scrollToBottom = () => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({
      top: element.scrollHeight,
      // 尊重系统的「减少动效」：不该为一个回滚按钮硬播一段动画
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
    setPinnedToBottom(true)
  }

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      {/*
        滚动容器**铺满**（滚动条因此始终贴在面板边缘）。
        里面那层才是「内容盒子」：限宽居中档把宽度约束挂在它身上；
        `h-full` 不能省 —— 空态是 `h-full` 居中的，少了它百分比高度会退化成 auto、
        空态就贴到顶上了（内容比视口高时照常滚动：溢出会被滚动容器算进 scrollHeight）。
      */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'h-full overflow-y-auto',
          stableScrollbarGutter && '[scrollbar-gutter:stable_both-edges]',
        )}
      >
        <div className={cn('h-full', contentClassName)}>
          <AiConversation manageHistory={manageHistory} surface={surface} />
        </div>
      </div>

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
  )
}
