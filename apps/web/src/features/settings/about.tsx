import { useTranslation } from 'react-i18next'
import packageJson from '../../../package.json?raw'
import { PageHeader } from '#/components/page-header'
import { SettingsCard, SettingRow } from '#/components/settings-card'
import { getDeploymentSnapshot } from '#/lib/app-config'
import { useBrand } from '#/lib/brand'

/**
 * 设置 → 关于（src/features/settings/about.tsx -> "/settings/about"）
 *
 * 纯静态的只读页面：展示应用名、版本号与技术栈，**不发任何请求**，
 * 页面里也不放任何可编辑控件（与「外观 / AI」那种即时生效的偏好页不同，
 * 这一页连设置项都没有，只是信息展示）。
 *
 * 版本号直接读 `package.json` 的 `version`（单一真值，不另外维护一份常量）——
 * 与仪表盘的版本信息卡同一套做法（见 `src/features/home/version-card.tsx`）。
 * 卡片外壳与「左 label / 右内容」的行布局来自 `#/components/settings-card`，
 * 不在页面里手写 `LayerCard`。
 */
/** 构建期已知的版本号；解析失败时用占位符，不编造版本。 */
const appVersion = (JSON.parse(packageJson) as { version?: string }).version || '—'

/**
 * 部署模式在**构建期**就固定了（`import.meta.env` 是静态替换），
 * 所以这里可以在模块级求值一次 —— 它不会随运行期状态变化。
 */
const deployment = getDeploymentSnapshot()

export function AboutPage() {
  const { t } = useTranslation()
  const brand = useBrand()

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title={t('profileNav.about', '关于')} />

      <SettingsCard title={t('profile.sections.basic', '基本信息')}>
        <SettingRow label={t('about.fields.appName', '应用名')}>
          {/* 应用名 + 一句话说明这个后台是做什么的，两行同属「应用名」这一项 */}
          <div className="flex flex-col gap-0.5 text-end">
            <span className="text-sm font-medium text-kumo-default">{brand.name}</span>
            <span className="text-sm text-kumo-subtle">
              {t('about.appDescription', brand.description)}
            </span>
          </div>
        </SettingRow>

        <SettingRow label={t('about.fields.version', '版本号')}>
          <span className="text-sm text-kumo-default tabular-nums">{appVersion}</span>
        </SettingRow>

        <SettingRow label={t('about.fields.techStack', '技术栈')}>
          <span className="text-sm text-kumo-default">
            {t('about.techStack', 'React · Vite · TanStack Router · Tailwind · Kumo')}
          </span>
        </SettingRow>
      </SettingsCard>

      {/*
        部署模式：唯一真值是构建期环境变量（`#/lib/app-config`），
        这一卡只是把人眼能核对的那几个维度摊开 —— 排查「为什么没有选择页 /
        为什么登录页没有注册入口」时不必再去翻 .env。
      */}
      <SettingsCard
        title={t('about.deployment.title', '部署模式')}
        description={t('about.deployment.hint', '由构建期环境变量决定（见 apps/web/.env.example）')}
      >
        <SettingRow label={t('about.deployment.appDimension', '应用维度')}>
          <span className="text-sm text-kumo-default">
            {deployment.app === 'multi'
              ? t('about.deployment.appMulti', '多应用')
              : t('about.deployment.appSingle', '单应用')}
          </span>
        </SettingRow>

        <SettingRow label={t('about.deployment.accountDimension', '账号维度')}>
          <span className="text-sm text-kumo-default">
            {deployment.account === 'multi'
              ? t('about.deployment.accountMulti', '多账号')
              : t('about.deployment.accountSingle', '单账号')}
          </span>
        </SettingRow>

        {/* 单应用模式没有选择页这一步，这一行只在多应用下有信息量 */}
        {deployment.app === 'multi' ? (
          <SettingRow label={t('about.deployment.appSelectMode', '进入应用选择')}>
            <span className="text-sm text-kumo-default">
              {t(`about.deployment.appSelectModes.${deployment.appSelect}`, deployment.appSelect)}
            </span>
          </SettingRow>
        ) : null}

        <SettingRow label={t('about.deployment.superAdmin', '最高管理员')}>
          <span className="text-sm text-kumo-default">
            {deployment.superAdminId || t('about.deployment.superAdminUnset', '未配置')}
          </span>
        </SettingRow>
      </SettingsCard>
    </div>
  )
}
