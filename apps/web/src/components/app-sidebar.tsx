import { Sidebar, useSidebar } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppSwitcher } from '#/components/app-switcher'
import { DesktopSidebarHeader } from '#/components/desktop-title-bar'
import { ShortcutKbd } from '#/components/kbd'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'
import { isDesktop } from '#/lib/desktop-bridge'
import {
  filterNavGroups,
  NAV_GROUPS,
  type NavGroup,
  type NavGroupFilter,
  type NavItem,
  type NavItemFilter,
} from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'

export interface AppSidebarProps {
  /**
   * 导航数据（路由/权限）尚未就绪时，用 `Sidebar.Loading` 渲染骨架行，
   * 避免骨架屏突变造成视觉跳动。配合外部 loader / query 使用：
   * `const { isLoading } = useNavData(); <AppSidebar isLoading={isLoading} />`
   */
  isLoading?: boolean
  /** 点击搜索按钮直接打开全局命令面板 */
  onOpenCommandPalette?: () => void
  /**
   * 侧边栏菜单分组数据对象配置，默认读取 `NAV_GROUPS`。
   * 完全由配置对象驱动渲染。
   */
  navGroups?: NavGroup[]
  /** 额外的菜单项过滤谓词列表，支持外界动态添加过滤条件 */
  filters?: NavItemFilter[]
  /** 额外的分组过滤谓词列表 */
  groupFilters?: NavGroupFilter[]
  /** 是否启用基于当前用户权限的菜单过滤，默认为 true */
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

/**
 * 解析导航文案：优先取 common 命名空间下的 i18n 键，缺失时回退到配置里的原始文案。
 */
function useNavLabel() {
  const { t } = useTranslation()
  return (labelKey: string | undefined, label: string) => (labelKey ? t(labelKey, label) : label)
}

interface CollapsibleNavItemProps {
  item: NavItem
  appPrefix: string
  pathname: string
  /** 已解析的父项文案（i18n 优先）。 */
  label: string
  /** 父项自身命中，且没有子项命中。 */
  active: boolean
  /** 分组内有子项命中（当前路由位于该分组之下）。 */
  childActive: boolean
  onNavigate: () => void
}

/**
 * 带二级导航的折叠分组。
 *
 * 展开状态受控于本组件，而不是交给 `Collapsible` 的内部 state：
 * 1. 初始值 = 配置的 `defaultOpen` 或「已有子项命中」（直接刷新子页面时同步展开）；
 * 2. 之后路由切到该分组的子项时自动展开，保证当前所在位置在侧边栏可见；
 * 3. 用户手动折叠仍然有效——只有在 `childActive` 由 false 变 true 时才强制展开。
 */
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
                active={isItemActive(pathname, child.to, appPrefix)}
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

/**
 * 侧边栏导航。
 *
 * 结构遵循 Kumo Sidebar 的约定：
 * - 菜单完全由配置对象（`NavGroup[]`）驱动，支持灵活配置和多重管道过滤；
 * - 集成权限过滤与自定义过滤谓词，无权访问或过滤剔除的分组/菜单项自动收敛隐藏；
 * - `Provider`（在 app-shell.tsx 中）负责状态，`Sidebar` 是容器本身；
 * - `Content` 是可滚动区，`Header` / `Footer` 固定在其上下方；
 * - `MenuButton` / `MenuSubButton` 会自动包一层 `<li>`，
 *   只有需要包住 `Collapsible` 时才显式使用 `MenuItem`；
 * - 折叠态下由 `tooltip` 提供标签，`itemId` 供 `useSidebar().scrollToItem()` 定位。
 */
export function AppSidebar({
  isLoading = false,
  onOpenCommandPalette,
  navGroups,
  filters,
  groupFilters,
  enablePermissionFilter = true,
}: AppSidebarProps) {
  const { t } = useTranslation()
  const resolveLabel = useNavLabel()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const appPrefix = `/${appId}`

  // 权限上下文统一由 `usePermissionContext` 提供（权限同步的时机在 `AppShell` 层）
  const permissionContext = usePermissionContext()

  // 菜单对象过滤管道：执行权限过滤与自定义过滤
  const displayGroups = useMemo(() => {
    return filterNavGroups(navGroups ?? NAV_GROUPS, {
      context: permissionContext,
      itemFilters: filters,
      groupFilters,
      enablePermissionFilter,
    })
  }, [navGroups, filters, groupFilters, enablePermissionFilter, permissionContext])

  const handleItemClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleSearchClick = () => {
    onOpenCommandPalette?.()
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const renderItem = (item: NavItem) => {
    const itemHref = `${appPrefix}${item.to}`
    const itemLabel = resolveLabel(item.labelKey, item.label)
    // 分组项不继承子项的高亮：`isItemActive` 用路径前缀匹配，
    // 子项命中（如 /system/menu/list）时父项（/system）也会被判定为 active，
    // 造成父子双层灰底。这里让子项独占选中态，父项只表达「展开/折叠」语义。
    const childActive =
      item.children?.some((child) => isItemActive(pathname, child.to, appPrefix)) ?? false
    const active = !childActive && isItemActive(pathname, item.to, appPrefix)

    // 带二级导航：Collapsible 需要显式包在 MenuItem 内。
    // 子模块较多的模块统一默认折叠（defaultOpen 缺省即 false），
    // 但当前路由已落在子项上时会自动展开，见 CollapsibleNavItem。
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
          onNavigate={handleItemClick}
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
        onClick={handleItemClick}
      >
        {label}
        {/*
          badge 紧跟标题，**不要加 `ms-auto`**：它承载的是「Beta / 内测」这类状态标记，
          语义上属于标题的一部分，推到行尾会读成「这项有 3 条未读」那种计数。
          Kumo `Sidebar.MenuBadge` 自带虚线 pill + `text-[11px]`，
          且自己带了 `group-data-[state=collapsed]/sidebar:hidden` —— 折叠态无需我们处理。
        */}
        {item.badge ? <Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge> : null}
      </Sidebar.MenuButton>
    )
  }

  const searchLabel = t('search.quickSearch', '快速搜索…')

  return (
    <Sidebar>
      {/* 桌面端全高侧边栏 Header：红绿灯避让、侧边栏开关与前进/后退导航 */}
      {isDesktop() ? <DesktopSidebarHeader /> : null}

      <Sidebar.Header className="flex items-center justify-between gap-1.5 px-2">
        <div className="min-w-0 flex-1">
          <AppSwitcher />
        </div>
        {isMobile ? <Sidebar.Close /> : null}
      </Sidebar.Header>

      {isLoading ? (
        <Sidebar.Loading />
      ) : (
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={MagnifyingGlassIcon}
                tooltip={searchLabel}
                onClick={handleSearchClick}
                className="mb-3 ring ring-kumo-line transition-[margin] duration-(--sidebar-animation-duration) group-data-[state=collapsed]/sidebar:mb-0 group-data-[state=collapsed]/sidebar:ring-transparent"
              >
                <span>{searchLabel}</span>
                {/* 快捷键：无边框包裹，降低功能键透明度（Mac显示⌘K，其他显示Ctrl K） */}
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

      {!isDesktop() ? (
        <Sidebar.Footer className="flex items-center group-data-[mobile=true]/sidebar:hidden">
          <Sidebar.Trigger />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  )
}
