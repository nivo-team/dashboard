import { useTranslation } from 'react-i18next'
import packageJson from '../../../package.json?raw'

/**
 * 版本信息卡（静态）。
 *
 * 只展示前端构建自身的元信息，**不发任何请求**：
 * - 版本号：直接读 `package.json` 的 `version`（单一真值，不另外维护一份常量）；
 * - 环境：从 `VITE_API_BASE_URL` 推断，识别不了的地址归入「自定义环境」，
 *   变量未配置时显示「未配置」—— 与概览卡「缺值不编造」的约定一致；
 * - 构建方式：固定文案，标明这是前端静态构建。
 */

/** 构建期已知的版本号；解析失败时用占位符，不编造版本。 */
const appVersion = (JSON.parse(packageJson) as { version?: string }).version || '—'

type EnvironmentKey = 'unconfigured' | 'production' | 'test' | 'staging' | 'development' | 'custom'

/**
 * 从接口基础地址推断部署环境。
 *
 * 只做关键词匹配：地址里带约定关键词就归到对应环境，识别不了就归入
 * 「自定义环境」。这里刻意**不根据「没有 test」反推生产** —— 那会把
 * 任何未知地址都说成生产，属于编造。
 */
function resolveEnvironment(baseUrl: string | undefined): EnvironmentKey {
  if (!baseUrl) return 'unconfigured'
  const url = baseUrl.toLowerCase()
  if (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('develop') ||
    /(^|[^a-z])dev([^a-z]|$)/.test(url)
  ) {
    return 'development'
  }
  if (url.includes('stag')) return 'staging'
  if (url.includes('test')) return 'test'
  if (url.includes('prod')) return 'production'
  return 'custom'
}

export function VersionCard() {
  const { t } = useTranslation('dashboard')

  const environment = resolveEnvironment(import.meta.env.VITE_API_BASE_URL)

  const items = [
    { key: 'version', value: appVersion },
    { key: 'environment', value: t(`cards.version.env.${environment}`) },
    { key: 'build', value: t('cards.version.buildStatic') },
  ]

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-kumo-subtle">{t(`cards.version.${item.key}`)}</dt>
          <dd className="truncate text-sm font-medium text-kumo-default" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
