import { Badge } from '@cloudflare/kumo'
import { InfoIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/**
 * 数据概览卡（**占位实现**）。
 *
 * 此处刻意**不请求任何接口**：指标口径（统计什么、按什么时间窗口）还没定，
 * 先接一个假接口只会让页面看起来「有数据」，掩盖口径未定这件事。
 *
 * 因此这里做两件必须做的事：
 * 1. 数字用明显的**占位值**，并在卡片里带一行「未接入」的说明与一枚「示例」徽章 ——
 *    不把兜底数据伪装成后端值（与设置页回落登录态时同一条约定）；
 * 2. 结构按真实形态搭好（三列指标 + 名称 / 数值 / 单位），接口就绪后
 *    只需把 `metrics` 换成 query 结果，布局与样式不用动。
 */
export function MetricsCard() {
  const { t } = useTranslation('dashboard')

  const metrics = [
    { key: 'users', value: '—' },
    { key: 'activeUsers', value: '—' },
    { key: 'orders', value: '—' },
  ] as const

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-2 text-xs text-kumo-subtle">
        <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          {t('cards.metrics.description', '卡片尚未接入接口，以下为占位示例数据')}
        </span>
        <Badge variant="secondary" className="ms-auto shrink-0">
          {t('cards.metrics.badge', '示例')}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.key} className="flex min-w-0 flex-col gap-1">
            <dt className="truncate text-xs text-kumo-subtle">
              {t(`cards.metrics.${metric.key}`, metric.key)}
            </dt>
            <dd className="text-2xl font-semibold text-kumo-default">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
