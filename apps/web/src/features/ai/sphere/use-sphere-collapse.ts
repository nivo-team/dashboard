import { useNavigate } from '@tanstack/react-router'
import { useCallback, useContext } from 'react'
import { readMaximizeOrigin } from '#/features/ai/core'
import { SphereTransitionContext } from './sphere-transition'

/**
 * 全屏对话页的**退出口**。分两层，写在这里好让所有出口共用同一套判断：
 *
 * - `useSphereCollapseNow`：**立即导航**，不播动画 —— 它是「收起」这件事的真值，
 *   也被布局拿去当过渡动画跑完后的落点（`SphereTransitionProvider` 的 `onExited`）；
 * - `useSphereCollapse`：出口组件调用的那个 —— 有过渡上下文时先播收起动画
 *   （见 `sphere-transition.tsx`），没有时退化为立即导航。
 *
 * 目标来自 `#/features/ai/core/panel-session` 记下的 href（含查询串，列表页的筛选条件能一起还原）；
 * 没有记录时（例如直接输 URL 进 `/sphere`、或换了标签页）回落到应用首页。
 *
 * 抽成 hook 是因为**多个**地方要用同一套判断：chat 头行的收起按钮、以及将来别处可能加的
 * 出口。各写一份必然有一处忘记兜底。
 */
export function useSphereCollapseNow(appId: string): () => void {
  const navigate = useNavigate()

  return useCallback(() => {
    const origin = readMaximizeOrigin()
    if (origin) {
      // 用 `navigate({ href })`：TanStack 会把整串 href 解析成 pathname / search / hash
      // 再做客户端跳转，不需要我们自己拆查询串。
      void navigate({ href: origin })
      return
    }
    void navigate({ to: '/$appId/home', params: { appId } })
  }, [navigate, appId])
}

/**
 * 「收起全屏对话」：优先播**收起过渡**（面板缩小淡出），动画结束才导航。
 *
 * 上下文由布局（`sphere-layout.tsx` 的 `SphereTransitionProvider`）提供，所以出口组件不需要知道
 * 动画存在、更不需要自己存「正在收起」的状态。
 */
export function useSphereCollapse(appId: string): () => void {
  const collapseNow = useSphereCollapseNow(appId)
  const transition = useContext(SphereTransitionContext)

  return transition?.requestCollapse ?? collapseNow
}
