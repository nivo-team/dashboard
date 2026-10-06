import { Input } from '@cloudflare/kumo'
import { MagnifyingGlassIcon, TrashIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiSessionDeleteDialog } from '#/features/ai/components/session-delete-dialog'
import { useAiSessionStore } from '#/features/ai/core'
import type { AiSessionSummary } from '#/features/ai/core'
import { GROUP_FALLBACK, formatRelative, groupSessions } from '#/features/ai/core/session-groups'
import { cn } from '#/lib/cn'

/**
 * AI 会话列表（**浮层形态**）：搜索框 + 按时间分组的历史 + 删除确认。
 *
 * AI 面板头行那颗会话选择器（`AiSessionPicker`）用的就是它。全屏对话页的会话侧边栏
 * 走的是 Kumo `Sidebar` 那套（`/$appId_.sphere` 的 `SphereSidebar`），但
 * **分组与相对时间的口径共用 `#/features/ai/core/session-groups`**，删除确认共用
 * `AiSessionDeleteDialog` —— 两处的差异只在容器与行样式，不在数据口径。
 *
 * 三件事都刻意做得很轻：
 * - **搜索只过滤标题**（本地内存过滤）：会话数量级是几十，不值得下推到 IndexedDB 建索引；
 * - **相对时间交给 `Intl.RelativeTimeFormat`**：见 `session-groups`；
 * - **删除走一次轻量确认**：见 `AiSessionDeleteDialog`。
 *
 * 注意列表项**不能写成 `<button>` 里再套删除 `<button>`**（非法嵌套）：
 * 外层是 `div`，标题与删除各是一个按钮。
 */
export function AiSessionList({
  className,
  onSelect,
}: {
  /** 滚动列表容器的额外类名（浮层里限高） */
  className?: string
  /** 切换会话之后的回调（浮层据此收起） */
  onSelect?: () => void
}) {
  const { t, i18n } = useTranslation('ai')
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const switchSession = useAiSessionStore((state) => state.switchSession)

  const [keyword, setKeyword] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AiSessionSummary | null>(null)

  const titleOf = (session: AiSessionSummary) => session.title || t('sessionNew', '新对话')

  const groups = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase()
    const matched = trimmed
      ? sessions.filter((item) => titleOf(item).toLowerCase().includes(trimmed))
      : sessions
    return groupSessions(matched)
    // titleOf 依赖 t，放进依赖数组会让每次语言变化都重算一次，这是期望行为
  }, [keyword, sessions, t])

  const handleSwitch = (sessionId: string) => {
    void switchSession(sessionId)
    setKeyword('')
    onSelect?.()
  }

  return (
    <>
      {/*
        三段（搜索 / 列表 / 底部按钮）之间**不画分割线**，只靠留白分层。
        输入框用默认尺寸（h-9 / px-3），所以图标从 `start-2` 挪到 `start-3`、
        左内边距相应加大到 `ps-9`（12px 内边距 + 16px 图标 + 8px 间隙）。
      */}
      <div className="p-2">
        <div className="relative">
          <MagnifyingGlassIcon
            size={16}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-kumo-subtle"
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('sessionSearch', '搜索对话')}
            aria-label={t('sessionSearch', '搜索对话')}
            className="w-full ps-9"
          />
        </div>
      </div>

      <div className={cn('overflow-y-auto p-1', className)}>
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-kumo-subtle">
            {keyword.trim()
              ? t('sessionNoMatch', '没有匹配的对话')
              : t('sessionEmpty', '还没有对话')}
          </p>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group}>
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-kumo-subtle">
                {t(`sessionGroups.${group}`, GROUP_FALLBACK[group])}
              </p>
              {items.map((session) => {
                const isActive = session.id === activeSessionId
                return (
                  <div
                    key={session.id}
                    className={cn(
                      'group/item flex items-center gap-1 rounded-md',
                      isActive ? 'bg-kumo-tint' : 'hover:bg-kumo-tint',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSwitch(session.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-start text-sm text-kumo-default"
                    >
                      <span className="min-w-0 flex-1 truncate">{titleOf(session)}</span>
                      <span className="shrink-0 text-xs text-kumo-subtle">
                        {formatRelative(session.updatedAt, i18n.language)}
                      </span>
                    </button>
                    {/*
                      删除按钮平时透明、悬停/聚焦才显形：键盘用户 Tab 过来时必须可见，
                      所以除了 group-hover 还要 focus-visible:opacity-100
                    */}
                    <button
                      type="button"
                      onClick={() => setPendingDelete(session)}
                      aria-label={t('sessionDelete', '删除对话')}
                      className="me-1 shrink-0 rounded p-1 text-kumo-subtle opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-kumo-danger focus-visible:opacity-100"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <AiSessionDeleteDialog
        session={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      />
    </>
  )
}
