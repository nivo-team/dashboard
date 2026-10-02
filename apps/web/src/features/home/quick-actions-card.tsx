import { LinkButton } from '@cloudflare/kumo'
import { DatabaseIcon, TableIcon, TreeStructureIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'

/**
 * 快捷入口卡（静态）。
 *
 * 只做**应用内跳转**，不请求接口。入口清单刻意写在这里而不是复用 `NAV_GROUPS`：
 * 侧边栏导航是「系统的完整地图」，而这张卡是「用户自己挑的常用入口」——
 * 将来它应当是可配置的（问的就是「每个人能用多少内容」这件事），
 * 现在就与导航解耦，避免以后为了可配置再去拆一次。
 *
 * 跳转走 Kumo `LinkButton` 的 `href`：`LinkProvider` 已把它桥接到 TanStack Router，
 * 因此是客户端导航（不整页刷新）。RTL 下图标与文字由 flex 自动换边。
 */
export function QuickActionsCard() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const actions = [
    {
      to: `/${appId}/example/user`,
      label: t('nav.tableExample', { ns: 'common', defaultValue: '表格示例' }),
      icon: TableIcon,
    },
    {
      to: `/${appId}/system/menus`,
      label: t('nav.systemMenus', { ns: 'common', defaultValue: '功能' }),
      icon: TreeStructureIcon,
    },
    {
      to: `/${appId}/system/data-dict`,
      label: t('nav.systemDataDict', { ns: 'common', defaultValue: '数据字典' }),
      icon: DatabaseIcon,
    },
  ]

  return (
    <div className="flex flex-col gap-1">
      {actions.map((action) => (
        <LinkButton
          key={action.to}
          href={action.to}
          variant="ghost"
          icon={<action.icon size={16} />}
          className="justify-start"
        >
          <span className="truncate">{action.label}</span>
        </LinkButton>
      ))}
    </div>
  )
}
