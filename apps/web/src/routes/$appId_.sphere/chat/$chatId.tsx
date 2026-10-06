import { createFileRoute, notFound } from '@tanstack/react-router'
import { SphereChatSessionPage } from '#/features/ai/sphere/sphere-chat-session'
import { SphereNotFound } from '#/features/ai/sphere/sphere-not-found'
import { useAiSessionStore } from '#/features/ai/core'

/**
 * 「指定会话」路由（`/$appId/sphere/chat/$chatId`）—— **薄适配层**。
 *
 * 会话 id 就是 IndexedDB 里的记录 id，所以**进这一页等价于「打开那一段对话」**：
 * loader 先确认这条记录在当前应用里存在，不存在直接 `notFound()`（渲染
 * `SphereNotFound`：AI 形象 + 文案，而不是通用线框 404）。
 *
 * 路由校验语义留在路由层；页面本体（把 store 切到该会话）在
 * `#/features/ai/sphere/sphere-chat-session`，`chatId` 通过 props 传入。
 */
export const Route = createFileRoute('/$appId_/sphere/chat/$chatId')({
  loader: async ({ params }) => {
    const exists = await useAiSessionStore.getState().hasSession(params.chatId)
    if (!exists) throw notFound()
  },
  component: SphereChatSessionRoute,
  notFoundComponent: SphereNotFound,
})

/** 只做取参：会话切换逻辑在 `#/features/ai/sphere/sphere-chat-session`。 */
function SphereChatSessionRoute() {
  const { chatId } = Route.useParams()
  return <SphereChatSessionPage chatId={chatId} />
}
