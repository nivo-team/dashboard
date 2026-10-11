import { Sidebar } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutKbd } from '#/components/kbd'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import {
  filterNavGroups,
  NAV_GROUPS,
  type NavGroup,
  type NavGroupFilter,
  type NavItem,
  type NavItemFilter,
} from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'

export interface DesktopSidebarProps {
  isLoading?: boolean
  onOpenCommandPalette?: () => void
  navGroups?: NavGroup[]
  filters?: NavItemFilter[]
  groupFilters?: NavGroupFilter[]
  enablePermissionFilter?: boolean
}

function isItemActive(pathname: string, targetPath: string, appPrefix: string): boolean {
  const fullTarget = `${appPrefix}${targetPath}`
  if (targetPath === '/home' || targetPath === '/') {
    return (
      pathname === `${appPrefix}/home` ||
      pathname === `${appPrefix}/home/` ||
      pathname === appPrefix ||
      pathname === `${appPrefix}/`
    )
  }
  return pathname === fullTarget || pathname.startsWith(`${fullTarget}/`)
}

function useNavLabel() {
  const { t } = useTranslation()
  return (labelKey: string | undefined, label: string) => (labelKey ? t(labelKey, label) : label)
}

interface CollapsibleNavItemProps {
  item: NavItem
  appPrefix: string
  pathname: string
  label: string
  active: boolean
  childActive: boolean
}

function CollapsibleNavItem({
  item,
  appPrefix,
  pathname,
  label,
  active,
  childActive,
}: CollapsibleNavItemProps) {
  const resolveLabel = useNavLabel()
  const [open, setOpen] = useState(() => childActive || Boolean(item.defaultOpen))
  const itemHref = `${appPrefix}${item.to}`

  useEffect(() => {
    if (childActive) {
      setOpen(true)
    }
  }, [childActive])

  return (
    <Sidebar.MenuItem>
      <Sidebar.Collapsible open={open} onOpenChange={setOpen} autoScrollOnOpen>
        <Sidebar.CollapsibleTrigger
          render={
            <Sidebar.MenuButton icon={item.icon} tooltip={label} itemId={itemHref} active={active}>
              {label}
              <Sidebar.MenuChevron className="sidebar-chevron" />
            </Sidebar.MenuButton>
          }
        />
        <Sidebar.CollapsibleContent>
          <Sidebar.MenuSub>
            {item.children?.map((child) => (
              <Sidebar.MenuSubButton
                key={child.to}
                href={`${appPrefix}${child.to}`}
                active={isItemActive(pathname, child.to, appPrefix)}
              >
                <span>{resolveLabel(child.labelKey, child.label)}</span>
                {child.badge ? <Sidebar.MenuBadge>{child.badge}</Sidebar.MenuBadge> : null}
              </Sidebar.MenuSubButton>
            ))}
          </Sidebar.MenuSub>
        </Sidebar.CollapsibleContent>
      </Sidebar.Collapsible>
    </Sidebar.MenuItem>
  )
}

/**
 * PC 桌面端业务侧边栏：
 * 1. 结构与桌面端 TitleBar 融合，去除顶部多余 Header 与 Logo；
 * 2. 纯粹由快速搜索与权限菜单组成；
 * 3. 底部不渲染展开/收起 Footer（由桌面窗口条统一控制）；
 * 4. 彻底移除移动端抽屉与点击关闭逻辑。
 */
export function DesktopAppSidebar({
  isLoading = false,
  onOpenCommandPalette,
  navGroups,
  filters,
  groupFilters,
  enablePermissionFilter = true,
}: DesktopSidebarProps) {
  const { t } = useTranslation()
  const resolveLabel = useNavLabel()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const appPrefix = `/${appId}`

  const permissionContext = usePermissionContext()

  const displayGroups = useMemo(() => {
    return filterNavGroups(navGroups ?? NAV_GROUPS, {
      context: permissionContext,
      itemFilters: filters,
      groupFilters,
      enablePermissionFilter,
    })
  }, [navGroups, filters, groupFilters, enablePermissionFilter, permissionContext])

  const renderItem = (item: NavItem) => {
    const itemHref = `${appPrefix}${item.to}`
    const itemLabel = resolveLabel(item.labelKey, item.label)
    const childActive =
      item.children?.some((child) => isItemActive(pathname, child.to, appPrefix)) ?? false
    const active = !childActive && isItemActive(pathname, item.to, appPrefix)

    if (item.children?.length) {
      return (
        <CollapsibleNavItem
          key={item.to}
          item={item}
          appPrefix={appPrefix}
          pathname={pathname}
          label={itemLabel}
          active={active}
          childActive={childActive}
        />
      )
    }

    const label = resolveLabel(item.labelKey, item.label)

    return (
      <Sidebar.MenuButton
        key={item.to}
        icon={item.icon}
        tooltip={label}
        itemId={itemHref}
        href={itemHref}
        active={active}
      >
        {label}
        {item.badge ? <Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge> : null}
      </Sidebar.MenuButton>
    )
  }

  const searchLabel = t('search.quickSearch', '快速搜索…')

  return (
    <Sidebar>
      {isLoading ? (
        <Sidebar.Loading />
      ) : (
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={MagnifyingGlassIcon}
                tooltip={searchLabel}
                onClick={onOpenCommandPalette}
                className="mb-3 ring ring-kumo-line transition-[margin] duration-(--sidebar-animation-duration) group-data-[state=collapsed]/sidebar:mb-0 group-data-[state=collapsed]/sidebar:ring-transparent"
              >
                <span>{searchLabel}</span>
                <ShortcutKbd
                  shortcutKey="K"
                  className="group-data-[state=collapsed]/sidebar:hidden"
                />
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>

          {displayGroups.map((group, index) => (
            <Sidebar.Group key={group.labelKey ?? group.label ?? `group-${index}`}>
              {group.label || group.labelKey ? (
                <Sidebar.GroupLabel>
                  {group.labelKey ? t(group.labelKey, group.label ?? '') : group.label}
                </Sidebar.GroupLabel>
              ) : null}
              <Sidebar.Menu>{group.items.map(renderItem)}</Sidebar.Menu>
            </Sidebar.Group>
          ))}
        </Sidebar.Content>
      )}

      <Sidebar.ResizeHandle />
    </Sidebar>
  )
}
