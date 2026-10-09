import { Button, DropdownMenu } from '@cloudflare/kumo'
import { PlusIcon, XIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { cn } from '#/lib/cn'
import {
  ALL_NAV_TARGETS,
  ALL_SHELL_NAV_TARGETS,
  filterNavTargets,
  filterShellNavItems,
  NAV_DIRECTORY_PATHS,
} from '#/lib/navigation'
import { resolvePageTab, usePageTabsStore, type PageTab } from '#/lib/page-tabs'
import { usePermissionContext } from '#/lib/permissions'

export interface PageTabStripProps {
  /**
   * 标签页全部关掉之后去哪儿。
   *
   * 由外壳传入（业务外壳给应用首页、`_main` 给设置首屏）：关掉最后一个标签页时，
   * 页面会跳到这里并**重新开出一个标签**，于是「全部关光」不会留下一片空白。
   */
  homeTo: string
}

/**
 * 页面标签条：左边是已打开的页面（可滚动），右边是「+」。
 *
 * 两处宿主，本体同一份（`#/lib/page-tabs` 是唯一数据源）：
 * - **桌面壳**：`#/components/desktop-title-bar` 的窗口条行首（恒开）；
 * - **浏览器**：顶栏行首那一格，替掉面包屑 —— 由 设置 → 外观 的「页面标签页」开关决定
 *   （默认关，见 `#/lib/store/shell-ui-store` 的 `pageTabsEnabled`）。
 *
 * 几个刻意的做法：
 *
 * - **标签是 `<button>` 而不是 `<a>`**。它长得像链接，但语义是「切换视图」而不是
 *   「打开一份新文档」：没有新标签页、没有复制链接地址，用链接反而要跟
 *   Kumo 链接主色（`text-kumo-link`）与下划线搏斗。键盘可达性由原生 button 保证。
 * - **中间键关闭**（`onAuxClick`）：浏览器标签的肌肉记忆，顺手给上。
 * - **中键/`✕` 关掉当前标签之后跳到右邻居，没有右邻居就跳左邻居**；关的不是当前标签
 *   就原地不动。这一条与浏览器一致，也让「连着关几个」不会每次都被弹走。
 */
export function PageTabStrip({ homeTo }: PageTabStripProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const tabs = usePageTabsStore((state) => state.tabs)
  const openTab = usePageTabsStore((state) => state.openTab)
  const removeTab = usePageTabsStore((state) => state.removeTab)

  /** 当前路径对应的标签（也是「哪个标签是激活态」的判据） */
  const activeTab = resolvePageTab(pathname)

  /*
    路由一变就把当前页面登记成标签。放在 effect 里而不是渲染期：渲染期改 store
    会触发 React 的「渲染中更新外部状态」警告，而标签条晚一帧拿到新标签并不影响观感。
  */
  useEffect(() => {
    const tab = resolvePageTab(pathname)
    if (tab) openTab(tab)
  }, [openTab, pathname])

  const handleClose = (tab: PageTab) => {
    const index = tabs.findIndex((item) => item.to === tab.to)
    removeTab(tab.to)
    if (tab.to !== activeTab?.to) return

    const rest = tabs.filter((item) => item.to !== tab.to)
    // 右邻居（删掉一位之后原来的下一位）优先，其次左邻居，都没有就回首页
    const next = rest[index] ?? rest[index - 1]
    void navigate({ to: (next?.to ?? homeTo) as never })
  }

  return (
    /*
      两个区域，**只有左边滚动**：
      - 左边 `nav` 是滚动容器（`flex-1 min-w-0 overflow-x-auto`）：标签多了在这里横滑，
        `scrollbar-width: none` 收掉滚动条（鼠标滚轮 / 触控板横滑照常）；
      - 右边「+」**固定在滚动区之外** —— 滚出去的只有标签，它始终看得见
        （原来它是滚动区里的最后一个子节点，标签一多就被推出视野）。
      两个容器都**不写** `--wails-draggable`（继承窗口条的 drag），
      只有标签本身与「+」写 `no-drag`：于是「标签右边那一大片空白」照样能拖窗口
      （早期版本把整条 nav 标成 no-drag，窗口条几乎没地方能拖）。
    */
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <nav
        aria-label={t('pageTabs.label', '页面标签页')}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        {tabs.map((tab) => {
          const active = tab.to === activeTab?.to
          const label = tab.labelKey ? t(tab.labelKey, tab.label) : tab.label
          const TabIcon = tab.icon

          return (
            <div
              key={tab.to}
              className={cn(
                'flex h-8 min-w-[110px] max-w-[200px] shrink items-center rounded-md border',
                // 标签自己（含里面的两个按钮）退出拖拽区，否则点不动
                '[--wails-draggable:no-drag]',
                // 激活态是「抬起来的一张卡」：与窗口条同底色的背景 + 一条描边
                active ? 'border-kumo-line bg-kumo-base' : 'border-transparent hover:bg-kumo-tint',
              )}
            >
              <button
                type="button"
                title={label}
                aria-current={active ? 'page' : undefined}
                onClick={() => void navigate({ to: tab.to as never })}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  handleClose(tab)
                }}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 ps-2.5 text-start"
              >
                {TabIcon ? (
                  <TabIcon
                    size={14}
                    aria-hidden
                    className={cn('shrink-0', active ? 'text-kumo-default' : 'text-kumo-subtle')}
                  />
                ) : null}
                <span
                  className={cn(
                    'truncate text-sm',
                    active ? 'font-medium text-kumo-default' : 'text-kumo-subtle',
                  )}
                >
                  {label}
                </span>
              </button>

              <button
                type="button"
                aria-label={t('pageTabs.close', { defaultValue: '关闭 {{label}}', label })}
                onClick={() => handleClose(tab)}
                className="me-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
              >
                <XIcon size={12} aria-hidden />
              </button>
            </div>
          )
        })}
      </nav>

      <NewTabMenu />
    </div>
  )
}

interface NewTabEntry {
  id: string
  label: string
  to: string
  icon: Icon
}

/**
 * 「+」：把还没有打开的页面挑一个出来开成新标签。
 *
 * 名单直接复用命令面板那两份导航数据（`ALL_NAV_TARGETS` / `ALL_SHELL_NAV_TARGETS`）
 * 与同一套权限过滤管道 —— **加页面只改 `navigation.ts`**，这里不会漏。
 * 只有两处收窄：**目录项不进菜单**（`NAV_DIRECTORY_PATHS`：示例 / 系统这些带 children
 * 的容器，点进去还是那几个子页面，列出来只是让人多点一层），以及按权限过滤。
 *
 * 点击只是普通跳转：标签由 `PageTabStrip` 的路由同步逻辑开出来，这里不自己建标签，
 * 否则「点了一次菜单」和「直接粘 URL 进来」会走出两套不同的标签状态。
 */
function NewTabMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const permissionContext = usePermissionContext()

  const groups = useMemo(() => {
    /** 文案键优先、缺失时直接用源语言兜底（与命令面板同一条约定） */
    const label = (labelKey: string | undefined, fallback: string) =>
      labelKey ? t(labelKey, fallback) : fallback

    // 业务页面的 `to` 相对 appId，要拼前缀；二级项带上父级名（`示例 · 表格示例`）才认得出位置
    const pages = filterNavTargets(ALL_NAV_TARGETS, {
      context: permissionContext,
      filter: (item) => !NAV_DIRECTORY_PATHS.has(item.to),
    }).map((item): NewTabEntry => {
      const self = label(item.labelKey, item.label)
      const parent = item.parentLabelKey
        ? label(item.parentLabelKey, item.parentLabel ?? item.parentLabelKey)
        : undefined
      return {
        id: `page:${item.to}`,
        label: parent ? `${parent} · ${self}` : self,
        to: `/${appId}${item.to}`,
        icon: item.icon,
      }
    })

    // 外壳页面的 `to` 已是绝对路径，不能再拼 appId
    const shell = filterShellNavItems(ALL_SHELL_NAV_TARGETS, { context: permissionContext }).map(
      (item): NewTabEntry => ({
        id: `shell:${item.to}`,
        label: label(item.labelKey, item.label),
        to: item.to,
        icon: item.icon,
      }),
    )

    return [
      { id: 'pages', label: t('pageTabs.groups.pages', '页面'), items: pages },
      { id: 'shell', label: t('pageTabs.groups.shellPages', '设置与账号'), items: shell },
    ]
  }, [appId, permissionContext, t])

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            // 自己退出拖拽区（窗口条上这一颗要能点），并**不参与滚动**：见上面两个区域的注释
            className="shrink-0 text-kumo-subtle hover:text-kumo-default [--wails-draggable:no-drag]"
            icon={<PlusIcon size={16} />}
            aria-label={t('pageTabs.new', '打开新页面')}
          />
        }
      />
      <DropdownMenu.Content className="max-h-[70svh] w-56 overflow-y-auto" align="start">
        {groups.map((group) => (
          <Fragment key={group.id}>
            <div className="px-3 py-1.5 text-xs text-kumo-subtle">{group.label}</div>
            {group.items.map((item) => {
              const ItemIcon = item.icon
              return (
                <DropdownMenu.Item
                  key={item.id}
                  className="gap-2"
                  onClick={() => void navigate({ to: item.to as never })}
                >
                  <ItemIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
                  <span className="truncate text-xs text-kumo-default">{item.label}</span>
                </DropdownMenu.Item>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
