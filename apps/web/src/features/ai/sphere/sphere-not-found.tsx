import { Button } from '@cloudflare/kumo'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'

/**
 * 会话 404（`/$appId/sphere/chat/$chatId` 找不到那条记录时）。
 *
 * **不走仓库通用的线框 404**：那个整页版式是给「路由不存在」用的，嵌在这块圆角对话面板里
 * 又重又割裂。这里沿用会话区的语言：同一枚 AI 形象（`sleeping`，和「还没配模型」那个空态
 * 是同一个角色）+ 一句说明 + 「新对话」出口。
 *
 * 头行**依然在**（挂在布局上，见 `sphere-header.tsx`），只是标题留空 —— 所以这里不必再放
 * 「收起 / 返回」：收起全屏、展开侧边栏换一段对话都还够得着。这里只补「就地开一段新的」。
 */
export function SphereNotFound() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  /*
    路径首段就是 appId（`/$appId/sphere/chat/...`）。这里**拿不到路由参数**
    （notFoundComponent 不是路由组件），从 pathname 取与 `not-found.tsx` 的
    `NotFoundPage` 做法一致。
  */
  const appId =
    useRouterState({ select: (state) => state.location.pathname })
      .split('/')
      .filter(Boolean)[0] ?? ''

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <AiBotAvatar size={96} state="sleeping" />

      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-kumo-default">
          {t('notFoundTitle', '对话不存在')}
        </p>
        <p className="max-w-64 text-sm text-kumo-subtle">
          {t('notFoundDesc', '它可能已被删除，或者链接不正确。')}
        </p>
      </div>

      <Button
        variant="secondary"
        onClick={() => {
          void navigate({ to: '/$appId/sphere', params: { appId } })
        }}
      >
        {t('sessionNew', '新对话')}
      </Button>
    </div>
  )
}
