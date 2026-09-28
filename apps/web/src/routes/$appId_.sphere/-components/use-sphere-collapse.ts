import { useNavigate } from '@tanstack/react-router'
import { readMaximizeOrigin } from '#/lib/ai'

/**
 * 「收起全屏对话」：回到**点「最大化」时所在的那一页**。
 *
 * 目标来自 `#/lib/ai/panel-session` 记下的 href（含查询串，列表页的筛选条件能一起还原）；
 * 没有记录时（例如直接输 URL 进 `/sphere`、或换了标签页）回落到应用首页。
 *
 * 抽成 hook 是因为**三个**地方要用同一套判断：chat 头行的收起按钮、会话 404 里的返回、
 * 以及将来别处可能加的出口。各写一份必然有一处忘记兜底。
 */
export function useSphereCollapse(appId: string): () => void {
  const navigate = useNavigate()

  return () => {
    const origin = readMaximizeOrigin()
    if (origin) {
      // 用 `navigate({ href })`：TanStack 会把整串 href 解析成 pathname / search / hash
      // 再做客户端跳转，不需要我们自己拆查询串。
      void navigate({ href: origin })
      return
    }
    void navigate({ to: '/$appId/home', params: { appId } })
  }
}
