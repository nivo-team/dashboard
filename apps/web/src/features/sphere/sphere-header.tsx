import { Button, Sidebar, Tooltip, useSidebar } from '@cloudflare/kumo'
import { ArrowsInSimpleIcon } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useActiveSessionTitle } from '#/components/ai-session-picker'
import { useAiSessionStore } from '#/lib/ai'
import { useSphereCollapse } from './use-sphere-collapse'

/**
 * 全屏对话页的**头行**：三列等宽网格 → 标题居中；行首是展开侧边栏按钮（只在侧边栏收起时
 * 出现）、行尾是「收起」。
 *
 * 它挂在**布局**（`sphere-layout.tsx`）上，而不是各页面组件里 —— 这样会话 404 时头行依然在
 * （`notFoundComponent` 只会替换掉路由组件本身）：用户还能收起全屏、还能展开侧边栏去
 * 换一段对话，不会被困在一张没有出口的空页上。
 *
 * 标题因此不能只读 `activeSessionId`：
 * - **新会话路由**（`sphere/`）→ `useActiveSessionTitle()`（当前这段，空会话落回「新对话」）；
 * - **指定会话路由**（`sphere/chat/$chatId`）→ 从会话列表里按 id 取标题；
 *   **列表里没有就是「这段对话不存在」**（路由那边已经渲染 404），标题**留空** ——
 *   这正是「404 时 header 还在、但不显示内容」的实现。
 *
 * 路由是不是指定会话，从 pathname 判（`/…/sphere/chat/<id>`）：`notFoundComponent`
 * 不是路由组件、拿不到路由参数，pathname 是这个位置唯一稳定的信号。
 */
export function SphereHeader({ appId }: { appId: string }) {
  const { t } = useTranslation('ai')
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const activeSessionTitle = useActiveSessionTitle()
  /**
   * 侧边栏此刻是不是可见的（桌面看 `open`、移动端看 `openMobile`）。与
   * `sphere-sidebar.tsx` 同一份判断 —— 两边用错一个就会同时冒出两个按钮。
   */
  const { open, openMobile, isMobile } = useSidebar()
  const sidebarVisible = isMobile ? openMobile : open
  const handleCollapse = useSphereCollapse(appId)

  // ['console', 'sphere', 'chat', '<id>'] —— 只有第 3 段是 chat 时才有会话 id
  const segments = pathname.split('/').filter(Boolean)
  const chatId = segments[2] === 'chat' ? segments[3] : undefined

  /*
    会话列表可能还没加载完（进页面时 IDB 是异步的）：此时若 `activeSessionId` 已经是
    这一段，就先用内存里的标题，避免标题闪一下空白。
  */
  const routeSession = chatId ? sessions.find((item) => item.id === chatId) : undefined
  const title = chatId
    ? (routeSession?.title ?? (activeSessionId === chatId ? activeSessionTitle : ''))
    : activeSessionTitle

  const sidebarLabel = sidebarVisible
    ? t('sidebarCollapse', '收起侧边栏')
    : t('sidebarExpand', '展开侧边栏')

  return (
    // 与侧边栏头行、AppHeader 同高（58px）
    <header className="grid h-[58px] shrink-0 grid-cols-3 items-center gap-2 border-b border-kumo-line px-3">
      <div className="flex min-w-0 items-center">
        {/* 侧边栏展开时按钮在侧边栏头行里，这里只在它收起后补位（一次只显示一个） */}
        {sidebarVisible ? null : (
          <Tooltip
            content={sidebarLabel}
            className="cursor-pointer"
            render={<Sidebar.Trigger aria-label={sidebarLabel} />}
          />
        )}
      </div>

      {/* 标题居中；不存在的那一段会话 → 空串（header 仍在，只是没有内容） */}
      <span className="min-w-0 truncate text-center text-sm font-medium text-kumo-default">
        {title}
      </span>

      <div className="flex min-w-0 items-center justify-end">
        <Tooltip
          content={t('sphereCollapse', '收起')}
          className="cursor-pointer"
          render={
            <Button
              variant="ghost"
              shape="square"
              onClick={handleCollapse}
              aria-label={t('sphereCollapse', '收起')}
            />
          }
        >
          {/* 四角向内的双箭头：中心对称，不随书写方向翻转，不加 `rtl-flip` */}
          <ArrowsInSimpleIcon size={16} />
        </Tooltip>
      </div>
    </header>
  )
}
