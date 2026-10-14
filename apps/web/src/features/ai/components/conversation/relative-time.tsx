import { Tooltip } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '#/lib/timezone'

/**
 * 相对时间展示：默认显示人性化的相对时间（如「刚刚」、「3 分钟前」），
 * 鼠标悬浮通过 Tooltip 仅展示对应时区的完整绝对时间。
 *
 * 用户消息与助手消息的操作栏共用它 —— 两处的「这个时间点是什么时候」必须读起来一样。
 */
export function RelativeTimeTooltip({ value }: { value: string | undefined }) {
  const { formatDateTime, formatRelative } = useTimezone()
  const { i18n } = useTranslation()
  if (!value) return null

  const absoluteTime = formatDateTime(value)
  const relativeTime = formatRelative(value, { locale: i18n.language })

  return (
    <Tooltip content={absoluteTime}>
      <span className="cursor-default select-none text-[11px] text-kumo-subtle transition-colors hover:text-kumo-default">
        {relativeTime}
      </span>
    </Tooltip>
  )
}
