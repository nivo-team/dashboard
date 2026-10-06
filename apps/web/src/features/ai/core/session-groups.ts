/**
 * AI 会话列表的**纯展示口径**：按时间分组 + 相对时间。
 *
 * 抽出来是因为同一份口径有两处落点：
 * - `#/features/ai/components/session-list`（AI 面板头行的浮层选择器）；
 * - `/$appId/sphere` 的会话侧边栏（Kumo `Sidebar` 渲染）。
 *
 * 两处必须是同一套「今天 / 昨天 / 过去 7 天」与「4m / 9h / 20d」，
 * 所以只留这一份；组件里不要再各自实现。
 */

export type SessionGroup = 'today' | 'yesterday' | 'week' | 'month' | 'older'

export const GROUP_ORDER: SessionGroup[] = ['today', 'yesterday', 'week', 'month', 'older']

/** i18n 缺失时的兜底文案（键在 `sessionGroups.*`）。 */
export const GROUP_FALLBACK: Record<SessionGroup, string> = {
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
export function groupOf(timestamp: number, now: number = Date.now()): SessionGroup {
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
 * 相对时间（会话行尾的 4m / 9h / 20d）。
 *
 * 交给 `Intl.RelativeTimeFormat` 而不是自己拼字符串：7 种语言的语序、复数与缩写规则
 * 都不一样，浏览器已经实现好了，我们只需要挑一个合适的单位。
 */
export function formatRelative(timestamp: number, locale: string): string {
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

/**
 * 把「按时间分组」的会话列表算好，直接给渲染用。
 *
 * 传进来的顺序即分组内顺序（store 已按 `updatedAt` 倒序），空组不返回。
 */
export function groupSessions<T extends { updatedAt: number }>(
  sessions: readonly T[],
): Array<{ group: SessionGroup; items: T[] }> {
  const buckets = new Map<SessionGroup, T[]>()
  for (const session of sessions) {
    const group = groupOf(session.updatedAt)
    const bucket = buckets.get(group)
    if (bucket) bucket.push(session)
    else buckets.set(group, [session])
  }

  return GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    items: buckets.get(group) ?? [],
  }))
}
