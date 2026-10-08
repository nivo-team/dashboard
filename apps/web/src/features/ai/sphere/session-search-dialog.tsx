import { CommandPalette } from '@cloudflare/kumo'
import { ChatCircleDotsIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiSessionStore } from '#/features/ai/core'
import type { AiSessionSummary } from '#/features/ai/core'
import { formatRelative } from '#/features/ai/core/session-groups'

interface SessionPaletteItem {
  id: string
  label: string
  /** 行尾的相对时间（已本地化） */
  meta: string
  session: AiSessionSummary
}

interface SessionPaletteGroup {
  id: string
  label: string
  items: SessionPaletteItem[]
}

/**
 * 会话搜索弹窗：**只搜对话记录**（按标题），形态与 ⌘K 命令面板一致
 * （同一套 Kumo `CommandPalette` 原语），但它是**另一个独立弹窗**。
 *
 * 为什么单独一个而不是往命令面板里塞一项：命令面板搜的是「整个后台能去哪 / 能做什么」，
 * 这里搜的是「我聊过什么」，两者的数据源、命中语义与打开语境都不同。命令面板本身
 * 仍由 ⌘K 唤起（本页也挂了同一份），本弹窗由侧边栏的「搜索」入口打开，不占快捷键。
 *
 * 搜索只过滤标题：会话数量级是几十，不值得下推到 IndexedDB 建索引 —— 与浮层选择器
 * （`AiSessionList`）的口径一致，两边都靠 `#/features/ai/core/session-groups` 做时间格式化。
 *
 * 选中一段 = **导航**到 `/$appId/sphere/chat/$chatId`，由那个路由负责把 store 切过去
 * （会话选择只有一个所有者，见 `sphere-sidebar.tsx` 的说明）。
 */
export function SessionSearchDialog({
  appId,
  open,
  onOpenChange,
}: {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation('ai')
  const navigate = useNavigate()
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const [query, setQuery] = useState('')

  const groups = useMemo<SessionPaletteGroup[]>(() => {
    const titleOf = (session: AiSessionSummary) => session.title || t('sessionNew', '新对话')
    const trimmed = query.trim().toLowerCase()
    const matched = trimmed
      ? sessions.filter((session) => titleOf(session).toLowerCase().includes(trimmed))
      : sessions

    if (matched.length === 0) return []

    return [
      {
        id: 'sessions',
        label: t('sphereConversations', '对话'),
        items: matched.map((session) => ({
          id: session.id,
          label: titleOf(session),
          meta: formatRelative(session.updatedAt, i18n.language),
          session,
        })),
      },
    ]
  }, [query, sessions, t, i18n.language])

  const close = () => {
    onOpenChange(false)
    setQuery('')
  }

  const select = (item: SessionPaletteItem) => {
    close()
    void navigate({
      to: '/$appId/sphere/chat/$chatId',
      params: { appId, chatId: item.session.id },
    })
  }

  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      items={groups}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(item) => item.label}
      getSelectableItems={(items) => items.flatMap((group) => group.items)}
      onSelect={(item) => select(item)}
    >
      <CommandPalette.Input
        placeholder={t('sessionSearch', '搜索对话')}
        aria-label={t('sessionSearch', '搜索对话')}
      />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(group: SessionPaletteGroup) => (
            <CommandPalette.Group key={group.id} items={group.items}>
              <CommandPalette.GroupLabel>{group.label}</CommandPalette.GroupLabel>
              <CommandPalette.Items>
                {(item: SessionPaletteItem) => (
                  <CommandPalette.Item
                    key={item.id}
                    value={item}
                    /*
                      Kumo 的 Item 内置物理方向 `text-left`，RTL（阿拉伯语）下会把项内文字
                      顶到左侧；用逻辑属性 `text-start` 覆盖（与命令面板同一处理）。
                    */
                    className="text-start"
                    onClick={() => select(item)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <ChatCircleDotsIcon size={16} className="shrink-0 text-kumo-subtle" />
                      <span className="min-w-0 flex-1 truncate text-sm text-kumo-default">
                        {item.label}
                      </span>
                      {/* 当前会话在列表里点出来一眼能认 */}
                      {item.session.id === activeSessionId ? (
                        <span className="shrink-0 text-xs text-kumo-brand">
                          {t('sessionCurrent', '当前')}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-xs text-kumo-subtle">{item.meta}</span>
                    </span>
                  </CommandPalette.Item>
                )}
              </CommandPalette.Items>
            </CommandPalette.Group>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>{t('sessionNoMatch', '没有匹配的对话')}</CommandPalette.Empty>
      </CommandPalette.List>
    </CommandPalette.Root>
  )
}
