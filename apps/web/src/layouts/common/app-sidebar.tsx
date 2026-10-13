import { Sidebar, useSidebar } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppSwitcher } from '#/components/app-switcher'
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
import { isNavItemActive } from './nav-matching'
import {
  SIDEBAR_DRAWER_HEADER_CLASS,
  SIDEBAR_HEADER_CLASS,
  SIDEBAR_SEARCH_CLASS_FOLDABLE,
  SIDEBAR_SEARCH_CLASS_PLAIN,
} from './sidebar-chrome'
import type { SidebarVariant } from './sidebar-variant'

/**
 * 业务侧边栏 —— **三个平台变体共用的一份实现**。
 *
 * ## 为什么是一份
 *
 * 原本 web / mobile / desktop 各有一份 ~200 行的侧边栏，其中菜单树渲染、高亮判定、
 * 权限过滤、搜索入口**逐字相同**，只有四处平台差异。三份并存意味着「改一处忘两处」，
 * 加第四个平台（比如平板）还要再抄一份。
 *
 * 这里把差异**收敛成一张变体表**（`SIDEBAR_VARIANTS`）：
 *
 * | 变体 | 顶部 | 折叠按钮 | 点击导航后 | 搜索项的折叠态样式 |
 * | --- | --- | --- | --- | --- |
 * | `web` | 应用切换器 | 有 | 是移动抽屉就收起 | 跟随折叠 |
 * | `mobile` | 应用切换器 + 抽屉关闭键（含安全区） | 无 | 收起抽屉 | 固定 |
 * | `desktop` | **无**（与窗口标题栏融合） | 无（由窗口条统一控制） | 不处理 | 跟随折叠 |
 *
 * 加平台 = 加一行；渲染逻辑一行都不用动。
 *
 * ## 抽屉感知为什么要拆成两个组件
 *
 * `useSidebar()` 必须有 `Sidebar.Provider` 祖先，而 **PC 桌面端的外壳没有这个 Provider**
 * （它的折叠由窗口标题栏统一控制，见 `layouts/desktop/app-layout.tsx`）。
 * 所以「读抽屉状态」的那部分被隔离在 `DrawerAppSidebar` 里 —— 桌面端走纯视图
 * `AppSidebarView`，只有 web / mobile 才经过抽屉包装。**不要把它合回一个组件**，
 * 否则桌面端一渲染就会因为拿不到 Provider 报错。
 */


export interface AppSidebarProps {
  isLoading?: boolean
  onOpenCommandPalette?: () => void
  navGroups?: NavGroup[]
  filters?: NavItemFilter[]
  groupFilters?: NavGroupFilter[]
  enablePermissionFilter?: boolean
}

interface SidebarVariantTraits {
  /** 顶部区域形态：`switcher` 应用切换器 / `drawer` 切换器 + 抽屉关闭键（吸顶安全区）/ `none` 不渲染 */
  header: 'switcher' | 'drawer' | 'none'
  /** 底部是否渲染折叠按钮（桌面端由窗口标题栏统一控制，不渲染） */
  collapseTrigger: boolean
  /** 搜索项是否跟随侧边栏折叠态收起描边与下边距 */
  collapsibleSearch: boolean
}

const SIDEBAR_VARIANTS: Record<SidebarVariant, SidebarVariantTraits> = {
  web: { header: 'switcher', collapseTrigger: true, collapsibleSearch: true },
  mobile: { header: 'drawer', collapseTrigger: false, collapsibleSearch: false },
  desktop: { header: 'none', collapseTrigger: false, collapsibleSearch: true },
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
  onNavigate?: () => void
}

/** 带子菜单的导航项：可展开/收起，展开态跟随子项高亮自动打开。 */
function CollapsibleNavItem({
  item,
  appPrefix,
  pathname,
  label,
  active,
  childActive,
  onNavigate,
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
                active={isNavItemActive(pathname, child.to, appPrefix)}
                onClick={onNavigate}
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

export interface AppSidebarViewProps extends AppSidebarProps {
  /** 平台变体（见 `SIDEBAR_VARIANTS`）。 */
  variant: SidebarVariant
  /**
   * 每点击一次导航项 / 子项 / 搜索项后触发。
   * 抽屉式的两个变体用它收起抽屉；桌面端不需要（不传即可）。
   */
  onItemNavigate?: () => void
  /** 顶部区域右侧的附加节点（移动端放 `Sidebar.Close`）。 */
  headerTrailing?: ReactNode
}

/**
 * 侧边栏**纯视图**：不读抽屉状态，因此桌面端（无 `Sidebar.Provider`）也能直接渲染。
 * Web / 移动端请用 `DrawerAppSidebar` —— 它会补上「点击后收起抽屉」。
 */
export function AppSidebarView({
  variant,
  isLoading = false,
  onOpenCommandPalette,
  navGroups,
  filters,
  groupFilters,
  enablePermissionFilter = true,
  onItemNavigate,
  headerTrailing,
}: AppSidebarViewProps) {
  const { t } = useTranslation()
  const resolveLabel = useNavLabel()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const appPrefix = `/${appId}`

  const traits = SIDEBAR_VARIANTS[variant]
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
      item.children?.some((child) => isNavItemActive(pathname, child.to, appPrefix)) ?? false
    const active = !childActive && isNavItemActive(pathname, item.to, appPrefix)

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
          onNavigate={onItemNavigate}
        />
      )
    }

    return (
      <Sidebar.MenuButton
        key={item.to}
        icon={item.icon}
        tooltip={itemLabel}
        itemId={itemHref}
        href={itemHref}
        active={active}
        onClick={onItemNavigate}
      >
        {itemLabel}
        {item.badge ? <Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge> : null}
      </Sidebar.MenuButton>
    )
  }

  const searchLabel = t('search.quickSearch', '快速搜索…')

  return (
    <Sidebar>
      {traits.header === 'switcher' ? (
        <Sidebar.Header className={SIDEBAR_HEADER_CLASS}>
          <div className="min-w-0 flex-1">
            <AppSwitcher />
          </div>
          {headerTrailing}
        </Sidebar.Header>
      ) : null}

      {traits.header === 'drawer' ? (
        <Sidebar.Header className={SIDEBAR_DRAWER_HEADER_CLASS}>
          <div className="min-w-0 flex-1">
            <AppSwitcher />
          </div>
          {headerTrailing}
        </Sidebar.Header>
      ) : null}

      {isLoading ? (
        <Sidebar.Loading />
      ) : (
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={MagnifyingGlassIcon}
                tooltip={searchLabel}
                onClick={() => {
                  onOpenCommandPalette?.()
                  onItemNavigate?.()
                }}
                className={
                  traits.collapsibleSearch
                    ? SIDEBAR_SEARCH_CLASS_FOLDABLE
                    : SIDEBAR_SEARCH_CLASS_PLAIN
                }
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

      {traits.collapseTrigger ? (
        <Sidebar.Footer className="flex items-center">
          <Sidebar.Trigger />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  )
}

/**
 * 抽屉式侧边栏（Web 单页 + 移动端原生壳共用）。
 *
 * 这一层唯一多做的事就是读 `useSidebar()`：点击任何导航项后把移动抽屉收起来
 * —— 否则移动端点一个菜单项，新页面渲染了、抽屉还盖在上面。
 */
export function DrawerAppSidebar({
  variant,
  ...props
}: Omit<AppSidebarViewProps, 'onItemNavigate' | 'headerTrailing'>) {
  const { isMobile, setOpenMobile } = useSidebar()

  const closeDrawer = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  return (
    <AppSidebarView
      {...props}
      variant={variant}
      onItemNavigate={closeDrawer}
      // 只有真正的抽屉形态才有关闭键：Web 大屏下侧边栏是常驻的，没有「关掉」这一说
      headerTrailing={variant === 'mobile' ? <Sidebar.Close /> : undefined}
    />
  )
}
