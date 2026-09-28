import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { SphereChat } from './-components/sphere-chat'
import { useAiSessionStore } from '#/lib/ai'

/**
 * 「新会话」（`/$appId/sphere`）—— 全屏对话页的默认入口。
 *
 * 进来就**开一段新会话**：把 store 里的当前会话清掉（消息是全局单例，不清就会把
 * 上一段串进来）。之后用户发第一条消息才会落盘、拿到真实 id；想进入某一段已有对话
 * 走 `/$appId/sphere/chat/$chatId`。
 *
 * 这里**不做「拿到 id 后自动改地址」**：那条路要跟 `persist()` 的时序赛跑，
 * 收益只是地址栏好看一点，不值得。侧边栏点某一段自然会换到会话路由。
 */
export const Route = createFileRoute('/$appId_/sphere/')({
  component: SphereNewSessionPage,
})

function SphereNewSessionPage() {
  const startNewSession = useAiSessionStore((state) => state.startNewSession)

  useEffect(() => {
    startNewSession()
  }, [startNewSession])

  return <SphereChat />
}
