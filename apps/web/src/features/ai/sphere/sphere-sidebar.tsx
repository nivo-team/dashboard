import { Sidebar, Tooltip, useSidebar } from '@cloudflare/kumo'
import { MagnifyingGlassIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'
import { AiSessionDeleteDialog } from '#/features/ai/components/session-delete-dialog'
import { useAiSessionStore } from '#/features/ai/core'
import type { AiSessionSummary } from '#/features/ai/core'
import { GROUP_FALLBACK, formatRelative, groupSessions } from '#/features/ai/core/session-groups'
import { cn } from '#/lib/cn'
import { SessionSearchDialog } from './session-search-dialog'

/**
 * 全屏 AI 对话页的侧边栏 —— 结构与 `AppSidebar` 同源，用的是 Kumo `Sidebar` 那一套：
 * `Header`（品牌行）/ `Content`（`Group` + `Menu` + `MenuButton`）/ `ResizeHandle`。
 *
 * 内容只有 AI 会话，没有应用导航：
 * - 顶部两个**动作行**：新聊天、搜索（打开单独的会话搜索弹窗）；
 * - 其下是**按时间分组的会话列表**（今天 / 昨天 / …），行尾悬停出删除按钮。
 *
 * ## 会话选择走 URL，不直接调 store
 *
 * 点一段会话 = `navigate` 到 `/$appId/sphere/chat/$chatId`；点「新聊天」=
 * `navigate` 到 `/$appId/sphere`。真正的 `switchSession` / `startNewSession` 由**路由**
 * 负责（见 `chat/$chatId.tsx` 与 `index.tsx`）—— 一个落点只有一个所有者，
 * 否则「先切 store 再跳路由」会在两个 owner 之间打架。
 *
 * 唯一例外：**已经在新会话路由上**再点「新聊天」—— 路由不会重挂，得在这里直接清。
 *
 * 三处刻意的取舍：
 *
 * 1. **头行右侧留白**：收起按钮不在这里，而在 chat 页头行最左（`sphere-chat.tsx` 的
 *    `Sidebar.Trigger`）—— 侧边栏只承载「我是谁、有哪些会话」。
 * 2. **删除键是 MenuItem 里的兄弟节点，不是 MenuButton 的子节点**：
 *    `MenuButton` 渲染 `<button>`，里面再套一个按钮是非法嵌套。所以行是
 *    `MenuItem`（`<li>`）里放 `MenuButton` + 一个绝对定位的删除键。
 * 3. **会话行不放图标**：会话没有天然图标，硬塞一个只会制造噪音；因此 Provider 用
 *    `collapsible="offcanvas"`（整列滑走）而不是收成只剩图标轨道的 `icon` 档。
 */
export function SphereSidebar({ appId }: { appId: string }) {
  const { t, i18n } = useTranslation('ai')
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const startNewSession = useAiSessionStore((state) => state.startNewSession)
  const {
    open,
    openMobile,
    isMobile,
    setOpenMobile,
  } = useSidebar()

  /**
   * 侧边栏此刻是不是可见的。
   *
   * 桌面看 `open`；移动端侧边栏是覆盖式抽屉，看 `openMobile` —— 用错那个的话，
   * 移动端会同时出现「抽屉头行的收起」和「chat 头行的展开」，或两个都不出现。
   */
  const sidebarVisible = isMobile ? openMobile : open

  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AiSessionSummary | null>(null)

  // 传进来的顺序即组内顺序（store 已按 updatedAt 倒序），空组不返回
  const groups = useMemo(() => groupSessions(sessions), [sessions])

  const titleOf = (session: AiSessionSummary) => session.title || t('sessionNew', '新对话')

  /** 已经在「新会话」路由上（尾斜杠两种写法都算） */
  const isNewSessionRoute = pathname.replace(/\/$/, '') === `/${appId}/sphere`

  /** 移动端侧边栏是覆盖式抽屉：动作做完就收掉，否则会挡住刚打开的对话 */
  const handleNew = () => {
    if (isMobile) setOpenMobile(false)
    if (isNewSessionRoute) {
      // 路由不会重挂，index.tsx 的 effect 不会再跑 —— 这里直接清掉当前会话
      startNewSession()
      return
    }
    void navigate({ to: '/$appId/sphere', params: { appId } })
  }

  const handleSwitch = (sessionId: string) => {
    if (isMobile) setOpenMobile(false)
    void navigate({
      to: '/$appId/sphere/chat/$chatId',
      params: { appId, chatId: sessionId },
    })
  }

  /** 搜索弹窗是独立的一层：移动端先把抽屉收掉，否则关掉弹窗后会又看到遮罩 */
  const handleSearch = () => {
    setSearchOpen(true)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      {/*
        内外分隔线**归侧边栏**：展开时在自己的内容容器行尾画一条，收起后不画 ——
        面板 wrapper 用的是 `variant="inset"`，Kumo 不会再加第二条线。
      */}
      <Sidebar contentClassName={cn(sidebarVisible && 'border-e border-kumo-line')}>
        {/*
          头行：品牌 + 标题；**展开态的收起按钮在标题右侧**。
          收起后整列滑走，这个按钮随之消失，改由 chat 头行那个接手（一次只显示一个）。
        */}
        <Sidebar.Header className="gap-2">
          <AiBotAvatar size={24} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
            {t('sphereTitle', '聊天')}
          </span>
          {sidebarVisible ? (
            <Tooltip
              content={t('sidebarCollapse', '收起侧边栏')}
              className="cursor-pointer"
              render={
                <Sidebar.Trigger aria-label={t('sidebarCollapse', '收起侧边栏')} />
              }
            />
          ) : null}
        </Sidebar.Header>

        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={PlusIcon}
                tooltip={t('sessionNew', '新对话')}
                onClick={handleNew}
              >
                {t('sessionNew', '新对话')}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={MagnifyingGlassIcon}
                tooltip={t('sessionSearch', '搜索对话')}
                onClick={handleSearch}
              >
                {t('sessionSearch', '搜索对话')}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>

          {groups.length === 0 ? (
            <p className="px-3 py-2 text-xs text-kumo-subtle">
              {t('sessionEmpty', '还没有对话')}
            </p>
          ) : (
            groups.map(({ group, items }) => (
              <Sidebar.Group key={group}>
                <Sidebar.GroupLabel>
                  {t(`sessionGroups.${group}`, GROUP_FALLBACK[group])}
                </Sidebar.GroupLabel>
                <Sidebar.Menu>
                  {items.map((session) => {
                    const isActive = session.id === activeSessionId
                    const title = titleOf(session)
                    return (
                      <Sidebar.MenuItem key={session.id} className="group/session">
                        <Sidebar.MenuButton
                          active={isActive}
                          tooltip={title}
                          // 行尾给删除键留位（它绝对定位在同一个 MenuItem 上）
                          className="pe-9"
                          onClick={() => handleSwitch(session.id)}
                        >
                          <span className="min-w-0 flex-1 truncate">{title}</span>
                          <span className="shrink-0 text-xs text-kumo-subtle">
                            {formatRelative(session.updatedAt, i18n.language)}
                          </span>
                        </Sidebar.MenuButton>

                        {/*
                          删除键平时透明、悬停/聚焦才显形：键盘用户 Tab 过来时必须可见，
                          所以除了 group-hover 还要 focus-visible:opacity-100。
                          可访问名称带上会话标题，读屏能听出删的是哪一段。
                        */}
                        <button
                          type="button"
                          onClick={() => setPendingDelete(session)}
                          aria-label={`${t('sessionDelete', '删除对话')}: ${title}`}
                          className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-kumo-subtle opacity-0 transition-opacity hover:text-kumo-danger focus-visible:opacity-100 group-hover/session:opacity-100"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </Sidebar.MenuItem>
                    )
                  })}
                </Sidebar.Menu>
              </Sidebar.Group>
            ))
          )}
        </Sidebar.Content>

        <Sidebar.ResizeHandle />
      </Sidebar>

      {/* 搜索是**独立弹窗**（只搜会话记录），不占 ⌘K —— 命令面板照旧由 ⌘K 唤起 */}
      <SessionSearchDialog appId={appId} open={searchOpen} onOpenChange={setSearchOpen} />

      <AiSessionDeleteDialog
        session={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      />
    </>
  )
}
