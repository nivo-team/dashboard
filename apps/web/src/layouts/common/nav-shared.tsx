import { Sidebar } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { ShortcutKbd } from '#/components/kbd'
import type { ShellNavItem } from '#/lib/navigation'
import { SIDEBAR_SEARCH_CLASS_FOLDABLE } from './sidebar-chrome'

/** 归一化尾斜杠：`/settings` 与 `/settings/` 是同一个 index 路由，不能因此丢掉高亮。 */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

/**
 * 外壳导航项的统一渲染：`_main` 通用导航（应用 / 个人资料）与个人资料二级导航
 * 共用同一份配置对象（`#/lib/navigation` 的 `MAIN_NAV_ITEMS` / `SETTINGS_NAV_ITEMS`），
 * 命令面板也读同一份数据。
 */
export function ShellNavButton({
  item,
  pathname,
  onNavigate,
}: {
  item: ShellNavItem
  pathname: string
  onNavigate: (to: string) => void
}) {
  const { t } = useTranslation()
  const current = normalizePath(pathname)
  const active = (item.matchPaths ?? [item.to]).some((path) => normalizePath(path) === current)
  const label = item.labelKey ? t(item.labelKey, item.label) : item.label

  return (
    <Sidebar.MenuButton
      icon={item.icon}
      tooltip={label}
      itemId={item.to}
      active={active}
      onClick={() => onNavigate(item.to)}
    >
      {label}
      {item.badge ? <Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge> : null}
    </Sidebar.MenuButton>
  )
}

/**
 * 「快速搜索」入口：与 `AppSidebar` 用同一套 Kumo 官方 Sidebar 搜索范式
 * （图标 + 文本 + ⌘K 提示 + ring 描边；折叠态自动收成图标并去掉描边与下边距）。
 */
export function SidebarSearchButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const label = t('search.quickSearch', '快速搜索…')

  return (
    <Sidebar.Group>
      <Sidebar.Menu>
        <Sidebar.MenuButton
          icon={MagnifyingGlassIcon}
          tooltip={label}
          onClick={onOpen}
          className={SIDEBAR_SEARCH_CLASS_FOLDABLE}
        >
          <span>{label}</span>
          <ShortcutKbd shortcutKey="K" className="group-data-[state=collapsed]/sidebar:hidden" />
        </Sidebar.MenuButton>
      </Sidebar.Menu>
    </Sidebar.Group>
  )
}
