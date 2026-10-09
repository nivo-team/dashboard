import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { Button, DropdownMenu } from '@cloudflare/kumo'
import { PlusIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHROME_TAB_HEIGHT,
  markDragEnd,
  PageTabItem,
  type PageTabVariant,
  type TabActions,
} from '#/components/page-tab-item'
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
import { useLocale } from '#/lib/use-locale'

export interface PageTabStripProps {
  /**
   * 标签页全部关掉之后去哪儿。
   *
   * 由外壳传入（业务外壳给应用首页、`_main` 给设置首屏）：关掉最后一个标签页时，
   * 页面会跳到这里并**重新开出一个标签**，于是「全部关光」不会留下一片空白。
   */
  homeTo: string
  /**
   * 外观，见 `#/components/page-tab-item`：
   * - `chrome`：桌面壳窗口条（Chrome 那种连成一片的标签）；
   * - `plain`：浏览器顶栏的小卡片（默认）。
   */
  variant?: PageTabVariant
}

/**
 * 页面标签条：**左边是可拖拽排序的标签（可滚动），右边紧跟着「+」**。
 *
 * 两处宿主，本体同一份（`#/lib/page-tabs` 是唯一数据源）：
 * - **桌面壳**：`#/components/desktop-title-bar` 的窗口条行首（恒开，`variant="chrome"`）；
 * - **浏览器**：顶栏行首那一格，替掉面包屑 —— 由 设置 → 外观 的「页面标签页」开关决定
 *   （默认关，见 `#/lib/store/shell-ui-store` 的 `pageTabsEnabled`）。
 *
 * ## 布局：三个区域，各管一件事
 *
 * ```
 * [ 滚动区：标签……（最宽占 80%）] [ + ] [ ← 留白（拖拽区）] [ 行末工具区 ]
 * ```
 *
 * - **滚动区**是 `flex-1` + `max-w-[80%]`：标签多了在它内部横滑，**只占八成宽**，
 *   于是「+」与行末那排按钮之间自然留出间距（用户要求的就是这个间距）；
 * - **「+」跟着标签走，不钉在最右边**：它在滚动区之外、紧挨着滚动区的右边缘 ——
 *   标签少时它就在最后一个标签后面，标签多到溢出时它仍在（滚动）区外看得见；
 * - **拖拽区不受影响**：这三个容器都**不写** `--wails-draggable`（继承窗口条的 drag），
 *   只有标签本身与「+」写 `no-drag` —— 于是标签右边那片留白照样能拖着走窗口。
 *
 * ## 拖拽排序（dnd-kit）
 *
 * 指针移动 6px 才算拖拽（`activationConstraint`），所以「点一下切换」不会被误判；
 * 只允许横向移动（`restrictToHorizontalAxis`）。排序规则在 store 里 ——
 * **不跨越固定 / 未固定那条界线**（见 `#/lib/page-tabs` 的 `moveTab`）。
 * 键盘拖拽刻意没开（它的激活键是空格 / 回车，与标签本身的激活键冲突）。
 */
export function PageTabStrip({ homeTo, variant = 'plain' }: PageTabStripProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const tabs = usePageTabsStore((state) => state.tabs)
  const openTab = usePageTabsStore((state) => state.openTab)
  const moveTab = usePageTabsStore((state) => state.moveTab)

  /**
   * 正在拖的那个标签是不是固定的（`null` = 没有拖拽进行中）。
   *
   * 拖拽**只在同一组内互动**：固定的与未固定的是两个区段（见 `#/lib/page-tabs` 的 `moveTab`），
   * 拖一个未固定的标签时，固定那一排既不能当落点、也不该跟着动 —— 反之亦然。
   * 这里记住「谁在被拖」，由每个标签自己算出要不要退出交互（`useSortable` 的 `disabled`）。
   */
  const [dragPinned, setDragPinned] = useState<boolean | null>(null)

  /** 当前路径对应的标签（也是「哪个标签是激活态」的判据） */
  const activeTab = resolvePageTab(pathname)
  const actions = useTabActions(homeTo, activeTab?.to ?? null)

  /*
    固定的标签与未固定的一起排（`tabs` 已是「固定的在前」的顺序），但**渲染进两个容器**：
    固定的那个不参与滚动。这里先按合并顺序取好下标 —— 右键菜单的
    「关闭左侧 / 右侧」判的就是这个顺序，不能按分组后的局部下标算。
  */
  /*
    **标签行**：两个区里都套这一层，行内布局（对齐、间距）只在这里定义一次 ——
    固定区与滚动区因此不可能走偏（之前两边各写一套，差一点就出现「固定的比底下的高 1px」）。

    行与外层的关系：外层负责裁剪 / 滚动与那 1px 的下探（`pt-px` + `-mb-px`），
    行负责把标签贴着行的下沿排 —— 标签的白色因此正好压住窗口条下边线，看着连成一体。
  */
  // `w-max`：行宽跟着标签走（固定区因此正好裹住标签；滚动区里它决定可滚动的宽度）。
  // 不用 `min-w-full` —— 百分比 min-width 在「宽度由内容决定」的父元素里是循环依赖，
  // 固定区会被撑成外层宽度，反而把滚动区挤出去。
  // `mb-px`（chrome）：把整行抬离外层底边 1px —— 标签底边因此落在窗口条下边线上，
  // 而外层的 **padding box 仍然一直延伸到标签底边之下 1px**，倒角圆弧的下半才不会被裁掉。
  // （不能用外层的 `pb-px` 来抬：`overflow` 的裁剪区就是 padding box，加了反而把裁剪区缩小。）
  const tabRowClass = cn(
    'flex w-max items-end',
    variant === 'chrome' ? 'mb-px gap-0' : 'gap-1',
  )

  /*
    两个区的外层共用这一串（`pt-px -mb-0.5`）：形状比标签盒上下各多 1px
    （`pt-px` 让出顶部那 1px、行自己的 `mb-px` 让出底部那 1px），
    `-mb-0.5`（即 -2px）把整个盒子推回原处 —— 标签的位置一动不动，
    而**外层的盒子上下各多出 1px** 来容纳形状（滚动区的裁剪区因此也够大）。
  */
  const zoneClass = variant === 'chrome' ? '-mb-0.5 pt-px' : undefined

  const indexed = tabs.map((tab, index) => ({ tab, index }))
  const pinnedEntries = indexed.filter((entry) => entry.tab.pinned)
  const unpinnedEntries = indexed.filter((entry) => !entry.tab.pinned)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  /*
    路由一变就把当前页面登记成标签。放在 effect 里而不是渲染期：渲染期改 store
    会触发 React 的「渲染中更新外部状态」警告，而标签条晚一帧拿到新标签并不影响观感。
  */
  useEffect(() => {
    const tab = resolvePageTab(pathname)
    if (tab) openTab(tab)
  }, [openTab, pathname])

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    // 先记一笔：紧接着浏览器补的那个 click 不能再当成「点了标签」
    markDragEnd()
    if (!over || active.id === over.id) return
    moveTab(String(active.id), String(over.id))
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 gap-1 self-stretch',
        /*
          chrome 外观里标签贴着窗口条下沿，于是「+」也要跟着贴到下沿、
          并把自己在**标签那一行的高度（34px）**里居中 —— 否则它会以整条窗口条居中，
          看起来比标签的图标 / 文字高一截（用户看到的就是这个）。
        */
        variant === 'chrome' ? 'items-end' : 'items-center',
      )}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        // 只许横向移动；再限制在标签条内，拖到条外时不会飞出去
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragStart={({ active }) => {
          setDragPinned(!!tabs.find((tab) => tab.to === active.id)?.pinned)
        }}
        onDragEnd={(event) => {
          setDragPinned(null)
          handleDragEnd(event)
        }}
        onDragCancel={() => {
          setDragPinned(null)
          markDragEnd()
        }}
        /*
          读屏提示：dnd-kit 默认那段是英文、而且讲的是键盘拖拽 —— 我们没开键盘传感器，
          说成那样只会误导。这里给一句如实的（纯指针拖拽）。
        */
        accessibility={{
          screenReaderInstructions: {
            draggable: t('pageTabs.dragHint', '用鼠标拖动标签可以调整顺序。'),
          },
        }}
      >
        <SortableContext items={tabs.map((tab) => tab.to)} strategy={horizontalListSortingStrategy}>
          {/*
            两个区：**固定的标签不参与滚动**（单独一个容器，永远露在外面），
            只有未固定的标签进滚动容器。`max-w-[80%]` 挂在两者外面 —— 这一整块
            （固定的 + 可滚动的）最多占窗口条的八成，剩下那条留白是与行末工具区之间的间距。
          */}
          <div
            className={cn(
              'flex min-w-0 max-w-[80%] shrink',
              // 与两个区的对齐一致：chrome 下底对齐，plain 下居中
              variant === 'chrome' ? 'items-end' : 'items-center',
            )}
          >
            {pinnedEntries.length > 0 ? (
              /*
                固定区：**不滚动、纵向也不滚**（`overflow-hidden` 两个轴一起禁掉）。
                与右边滚动区之间**不留间距**（外层没有 `gap`）—— 固定标签与第一个
                未固定标签的间距由各自的 gap 负责，两区贴合才不会在中间多出一道缝。
              */
              <div
                className={cn(
                  /*
                    **不设 `overflow`**（默认 visible）：形状比标签盒大一整圈 ——
                    顶部要 1px（描边上下各探出 0.5px）、左右各 9px（外翻倒角）。
                    之前这里写 `overflow-hidden`，结果固定标签的顶部描边整条被裁掉、
                    两侧倒角也被切平（实测：顶部直边那一行完全没有墨迹）。
                    固定区本来就不滚动，不需要裁剪；`pt-px` + `-mb-px` 与滚动区完全一致。
                  */
                  'flex shrink-0',
                  zoneClass,
                )}
              >
                <div className={tabRowClass}>
                  {pinnedEntries.map(({ tab, index }) => (
                  <PageTabItem
                    key={tab.to}
                    tab={tab}
                    index={index}
                    tabs={tabs}
                    variant={variant}
                    actions={actions}
                    dragPinned={dragPinned}
                      active={tab.to === activeTab?.to}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <nav
              aria-label={t('pageTabs.label', '页面标签页')}
              // 给 `styles.css` 当锚点：Chrome 那条底部倒角只挂在 chrome 外观上
              data-page-tab-variant={variant}
              className={cn(
                // 只允许横向滚：`overflow-x: auto` 会把 `overflow-y` 也算成 auto，
                // 于是形状那半个像素的溢出就会凭空多出一段纵向可滚动区域 —— 显式禁掉
                'flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]',
                // `items-*` 走三目：本仓的 `cn` 只拼接、不合并，两个对齐类同时在场就只剩源码顺序可赌
                variant === 'chrome'
                  ? // 左右各留 10px：给激活标签那对**底部倒角**留出画的地方（它长在标签外侧，
                    // 半径 10 就往外探 9px）；上下那 1px 与固定区共用同一串类
                    cn('px-2.5', zoneClass)
                  : 'px-1',
              )}
            >
              <div className={tabRowClass}>
                {unpinnedEntries.map(({ tab, index }) => (
                  <PageTabItem
                    key={tab.to}
                    tab={tab}
                    index={index}
                    tabs={tabs}
                    variant={variant}
                    actions={actions}
                    dragPinned={dragPinned}
                    active={tab.to === activeTab?.to}
                  />
                ))}
              </div>
            </nav>
          </div>
        </SortableContext>
      </DndContext>

      {/* 「+」在滚动区之外、紧挨着它 —— 跟着标签走，不钉在行末 */}
      <div
        className={cn(
          'flex shrink-0 items-center',
          // 与标签那一行**完全同一格**：同高（用标签高度那个常量）、同样往下探 1px
          variant === 'chrome' && '-mb-px',
        )}
        // 高度取 CHROME_TAB_HEIGHT：与标签、SVG 的 viewBox 同一个数
        style={variant === 'chrome' ? { height: CHROME_TAB_HEIGHT } : undefined}
      >
        <NewTabMenu />
      </div>
    </div>
  )
}

/**
 * 标签上的动作收口：**只有这里知道 router**，`#/lib/page-tabs` 那边只管数据。
 *
 * 「关掉之后看哪一页」的规则统一走 `settleAt`：**当前页还在就原地不动**，不在了才跳 ——
 * 于是「关的不是当前标签」自然被放过，不需要每个动作各写一遍判断。
 * 每个动作给出的落点都是**一定活下来**的那个：关别人时是右键点的那个标签，
 * 关全部时是外壳首页（它会重新开成一个标签）。
 */
function useTabActions(homeTo: string, activeTo: string | null): TabActions {
  const navigate = useNavigate()
  const { isRtl } = useLocale()

  return useMemo(() => {
    const snapshot = () => usePageTabsStore.getState()

    const settleAt = (fallback: string) => {
      if (activeTo && snapshot().tabs.some((tab) => tab.to === activeTo)) return
      void navigate({ to: fallback as never })
    }

    return {
      activate: (to) => void navigate({ to: to as never }),

      close: (to) => {
        // 右邻居优先、其次左邻居，都没有就回首页 —— 与浏览器关标签的手感一致
        const before = snapshot().tabs
        const index = before.findIndex((tab) => tab.to === to)
        const rest = before.filter((tab) => tab.to !== to)
        const neighbor = rest[index] ?? rest[index - 1]
        snapshot().removeTab(to)
        settleAt(neighbor?.to ?? homeTo)
      },

      closeOthers: (to) => {
        snapshot().closeOthers(to)
        settleAt(to)
      },

      closeSide: (to, physical) => {
        // 标签条按逻辑方向排布：RTL 下「左侧」是渲染顺序的后方
        const isStartSide = physical === (isRtl ? 'right' : 'left')
        snapshot().closeSide(to, isStartSide ? 'start' : 'end')
        settleAt(to)
      },

      closeAll: () => {
        snapshot().closeAll()
        settleAt(homeTo)
      },

      togglePinned: (to) => snapshot().togglePinned(to),
    }
  }, [activeTo, homeTo, isRtl, navigate])
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
            // 自己退出拖拽区（窗口条上这一颗要能点）；不参与滚动，所以永远看得见
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
