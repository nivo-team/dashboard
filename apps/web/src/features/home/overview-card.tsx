import { useTranslation } from 'react-i18next'
import { useAuth } from '#/lib/auth'

/**
 * 系统概览卡（静态）。
 *
 * 数据全部来自本地登录态（`useAuth`）—— 当前应用与账号是前端已有的状态，
 * **不发任何请求**，因此这张卡片在接口未就绪时也能正常工作。
 * 缺值一律显示「未提供」，不编造占位内容。
 */
export function OverviewCard() {
  const { t } = useTranslation('dashboard')
  const { currentApp, user } = useAuth()

  const unknown = t('cards.overview.unknown', '未提供')

  const items = [
    {
      label: t('cards.overview.app', '当前应用'),
      value: currentApp?.name,
    },
    {
      label: t('cards.overview.account', '登录账号'),
      value: user?.name || user?.username,
    },
    {
      label: t('cards.overview.domain', '接口地址'),
      value: currentApp?.domain,
    },
    {
      label: t('cards.overview.category', '应用类型'),
      value: currentApp?.category,
    },
  ]

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-kumo-subtle">{item.label}</dt>
          <dd className="truncate text-sm font-medium text-kumo-default" title={item.value}>
            {item.value || unknown}
          </dd>
        </div>
      ))}
    </dl>
  )
}
