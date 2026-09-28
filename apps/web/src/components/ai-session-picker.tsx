import { Button, Input, LayerDialog, Popover } from '@cloudflare/kumo'
import {
  CaretDownIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiSessionStore } from '#/lib/ai'
import type { AiSessionSummary } from '#/lib/ai'
import { cn } from '#/lib/cn'

/**
 * 当前会话的标题（没有标题的空白会话回落成「新对话」）。
 *
 * 两个使用点共用这一份：会话选择器的按钮文案，以及**折叠态浮窗**头行那句标题 ——
 * 折叠态只是把选择器换成「头像 + 标题」，标题必须与展开时所见完全一致。
 *
 * 放在这里而不是 `#/lib/ai`：兜底文案要过 i18n（`ai` 命名空间），lib 层不依赖
 * react-i18next；而「会话标题怎么取、怎么兜底」正是本模块的知识。
 */
export function useActiveSessionTitle(): string {
  const { t } = useTranslation('ai')
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)

  return useMemo(() => {
    const active = sessions.find((item) => item.id === activeSessionId)
    return active?.title || t('sessionNew', '新对话')
  }, [activeSessionId, sessions, t])
}

/**
 * 会话选择器：AI 面板头行左侧那颗按钮，点开是「搜索 + 按时间分组的历史 + 新对话」。
 *
 * 三件事都刻意做得很轻：
 * - **搜索只过滤标题**（本地内存过滤）：会话数量级是几十，不值得下推到 IndexedDB 建索引；
 * - **相对时间交给 `Intl.RelativeTimeFormat`**：7 种语言各自的分隔与语序都由浏览器处理，
 *   不用我们为每种语言写一套「4m / 9h / 20d」的模板；
 * - **删除走一次轻量确认**：会话记录是纯本地数据，但误删会丢掉整段对话，
 *   所以用 `LayerDialog.Alert` 问一句（与仓库其它删除操作一致）。
 *
 * 注意列表项**不能写成 `<button>` 里再套删除 `<button>`**（非法嵌套）：
 * 外层是 `div`，标题与删除各是一个按钮。
 */
export function AiSessionPicker() {
  const { t, i18n } = useTranslation('ai')
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const startNewSession = useAiSessionStore((state) => state.startNewSession)
  const switchSession = useAiSessionStore((state) => state.switchSession)
  const removeSession = useAiSessionStore((state) => state.removeSession)

  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AiSessionSummary | null>(null)

  const titleOf = (session: AiSessionSummary) =>
    session.title || t('sessionNew', '新对话')

  const activeTitle = useActiveSessionTitle()

  const groups = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase()
    const matched = trimmed
      ? sessions.filter((item) => titleOf(item).toLowerCase().includes(trimmed))
      : sessions

    const buckets = new Map<SessionGroup, AiSessionSummary[]>()
    for (const session of matched) {
      const group = groupOf(session.updatedAt)
      const bucket = buckets.get(group)
      if (bucket) bucket.push(session)
      else buckets.set(group, [session])
    }

    return GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
      group,
      items: buckets.get(group) ?? [],
    }))
    // titleOf 依赖 t，放进依赖数组会让每次语言变化都重算一次，这是期望行为
  }, [keyword, sessions, t])

  const handleNew = () => {
    startNewSession()
    setKeyword('')
    setOpen(false)
  }

  const handleSwitch = (sessionId: string) => {
    void switchSession(sessionId)
    setKeyword('')
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            // ghost 按钮形态：当前会话标题 + caret。`shrink`（而非 Button 默认的
            // `shrink-0`）是必须的，否则长标题会把头行的关闭按钮挤出去
            <Button
              variant="ghost"
              className="min-w-0 shrink justify-start gap-2 px-2 font-medium"
              aria-label={t('sessionPicker', '选择对话')}
            />
          }
        >
          {/* 只显示当前会话标题 + 下箭头（不再带 AI 标识图标） */}
          <span className="truncate">{activeTitle}</span>
          {/*
            `CaretDownIcon` 是**上下向**图标：它表示「点开一个浮层」，
            不随书写方向翻转，所以**不加 `rtl-flip`**（RTL 下翻的只有左右向箭头）。
          */}
          <CaretDownIcon size={12} className="shrink-0 text-kumo-subtle" />
        </Popover.Trigger>

        {/* 面板：`p-0` 顶掉 Kumo 默认的 px-4 py-3，三段（搜索 / 列表 / 底部）各自带内边距 */}
        <Popover.Content side="bottom" align="start" className="w-80 p-0">
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

          <div className="max-h-80 overflow-y-auto p-1">
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
                          <span className="min-w-0 flex-1 truncate">
                            {titleOf(session)}
                          </span>
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

          {/* 底部同样只留白、不画上边线；按钮回到默认尺寸，与输入框等高 */}
          <div className="p-2">
            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={handleNew}
            >
              <PlusIcon size={16} />
              {t('sessionNew', '新对话')}
            </Button>
          </div>
        </Popover.Content>
      </Popover>

      <LayerDialog.Alert
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>{t('sessionDelete', '删除对话')}</LayerDialog.Title>
          {/* Body 是必须的（Kumo 断言 Title / Body / Actions 各一个），说明放这里 */}
          <LayerDialog.Body>
            <p className="text-sm text-kumo-subtle">
              {t('sessionDeleteDesc', '删除后这段对话无法恢复。')}
            </p>
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={() => {
                if (pendingDelete) void removeSession(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              {t('actions.delete', '删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                              时间分组与相对时间                              */
/* -------------------------------------------------------------------------- */

type SessionGroup = 'today' | 'yesterday' | 'week' | 'month' | 'older'

const GROUP_ORDER: SessionGroup[] = ['today', 'yesterday', 'week', 'month', 'older']

const GROUP_FALLBACK: Record<SessionGroup, string> = {
  today: '今天',
  yesterday: '昨天',
  week: '过去 7 天',
  month: '过去 30 天',
  older: '更早',
}

const DAY_MS = 86_400_000

/**
 * 落在哪个时间分组。
 *
 * 以**本地时间的今天零点**为界（而不是「now - 24h」）：否则凌晨 1 点看昨天下午的会话
 * 会被算进「今天」，与用户对「今天」的直觉不符。
 */
function groupOf(timestamp: number, now: number = Date.now()): SessionGroup {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()

  if (timestamp >= todayStart) return 'today'
  if (timestamp >= todayStart - DAY_MS) return 'yesterday'
  if (timestamp >= todayStart - 6 * DAY_MS) return 'week'
  if (timestamp >= todayStart - 29 * DAY_MS) return 'month'
  return 'older'
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', DAY_MS],
  ['month', 30 * DAY_MS],
  ['year', 365 * DAY_MS],
]

/**
 * 相对时间（截图里的 4m / 9h / 20d 那一位）。
 *
 * 交给 `Intl.RelativeTimeFormat` 而不是自己拼字符串：7 种语言的语序、复数与缩写规则
 * 都不一样，浏览器已经实现好了，我们只需要挑一个合适的单位。
 */
function formatRelative(timestamp: number, locale: string): string {
  const diff = timestamp - Date.now()
  const absolute = Math.abs(diff)
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'narrow',
  })

  // 一分钟以内统一显示「刚刚 / now」，避免出现「0 分钟前」
  if (absolute < 60_000) return formatter.format(0, 'minute')

  for (let index = RELATIVE_UNITS.length - 1; index >= 0; index -= 1) {
    const [unit, ms] = RELATIVE_UNITS[index]
    if (absolute >= ms) return formatter.format(Math.round(diff / ms), unit)
  }

  return formatter.format(Math.round(diff / 60_000), 'minute')
}
