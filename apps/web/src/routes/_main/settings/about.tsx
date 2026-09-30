import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import packageJson from '../../../../package.json?raw'
import { PageHeader } from '#/components/page-header'
import { SettingsCard, SettingRow } from '#/components/settings-card'

/**
 * 设置 → 关于（/_main/settings/about.tsx -> "/settings/about"）
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
export const Route = createFileRoute('/_main/settings/about')({
  component: AboutPage,
})

/** 构建期已知的版本号；解析失败时用占位符，不编造版本。 */
const appVersion = (JSON.parse(packageJson) as { version?: string }).version || '—'

function AboutPage() {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title={t('profileNav.about', '关于')} />

      <SettingsCard title={t('profile.sections.basic', '基本信息')}>
        <SettingRow label={t('about.fields.appName', '应用名')}>
          {/* 应用名 + 一句话说明这个后台是做什么的，两行同属「应用名」这一项 */}
          <div className="flex flex-col gap-0.5 text-end">
            <span className="text-sm font-medium text-kumo-default">
              {t('about.appName', 'Nivo Admin')}
            </span>
            <span className="text-sm text-kumo-subtle">
              {t('about.appDescription', '多应用工作空间的后端管理台')}
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
    </div>
  )
}
