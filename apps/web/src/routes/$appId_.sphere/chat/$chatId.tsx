import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { SphereChat } from '../-components/sphere-chat'
import { SphereNotFound } from '../-components/sphere-not-found'
import { useAiSessionStore } from '#/lib/ai'

/**
 * 「指定会话」（`/$appId/sphere/chat/$chatId`）。
 *
 * 会话 id 就是 IndexedDB 里的记录 id，所以**进这一页等价于「打开那一段对话」**：
 * loader 先确认这条记录在当前应用里存在，不存在直接 `notFound()`（渲染 `SphereNotFound`：
 * AI 形象 + 文案，而不是通用线框 404），存在才让组件把 store 切过去。
 *
 * 为什么校验放 loader 而不是组件里 `switchSession` 后看结果：
 * - `notFound()` 是路由层的表达，能直接命中 `notFoundComponent`，不必自己造错误态；
 * - 组件挂载前就知道结果，避免先渲染一段空会话再跳 404 的闪动。
 *
 * 组件里**只在 `activeSessionId` 与 URL 不一致时才切**：从面板「最大化」过来时
 * 会话已经在 store 里（可能正在流式回复），无条件 `switchSession` 会从 IDB 重新加载
 * 消息，把还没落盘的流式增量冲掉。
 */
export const Route = createFileRoute('/$appId_/sphere/chat/$chatId')({
  loader: async ({ params }) => {
    const exists = await useAiSessionStore.getState().hasSession(params.chatId)
    if (!exists) throw notFound()
  },
  component: SphereSessionPage,
  notFoundComponent: SphereNotFound,
})

function SphereSessionPage() {
  const { chatId } = Route.useParams()
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const switchSession = useAiSessionStore((state) => state.switchSession)

  useEffect(() => {
    if (activeSessionId === chatId) return
    void switchSession(chatId)
  }, [activeSessionId, chatId, switchSession])

  return <SphereChat />
}
