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
import { Tooltip } from '@cloudflare/kumo'
import { PlusIcon } from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  markDragEnd,
  PageTabItem,
  type PageTabVariant,
  type TabActions,
} from '#/components/page-tab-item'
import { cn } from '#/lib/cn'
import { resolvePageTab, usePageTabsStore } from '#/lib/page-tabs'
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
  /** 点击「+」按钮时打开通用命令面板 */
  onOpenCommandPalette?: () => void
  /** 外部容器样式类名 */
  className?: string
}

/**
 * 页面标签条：**左边是可拖拽排序的标签（可滚动），右边紧跟着「+」**。
 *
 * 两处宿主，本体同一份（`#/lib/page-tabs` 是唯一数据源）：
 * - **桌面壳**：`#/desktop/title-bar` 的窗口条行首（恒开，`variant="chrome"`）；
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
export function PageTabStrip({
  homeTo,
  variant = 'plain',
  onOpenCommandPalette,
  className,
}: PageTabStripProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K'
  const newTabLabel = t('pageTabs.new', '打开新页面')

  const handleOpenPalette = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette()
      return
    }
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true,
      }),
    )
  }

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

  const navRef = useRef<HTMLElement | null>(null)

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
  const tabRowClass = 'flex h-full w-max items-center gap-1'

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

  /*
    主流标签栏标准做法（参考 Ant Design / Element Plus 最小化滚动交互）：
    当激活标签改变或标签增减时，在下一帧（requestAnimationFrame 确保 DOM 尺寸就绪）
    执行按需滚动：
    - 若当前激活的 Tab 已经 100% 完全可见（含外翻倒角），完全不触发任何滚动，零视觉抖动；
    - 仅在被遮挡出界时才滚动：最后一个标签滚到底，第一个标签滚到头，中间标签平滑带入。
  */
  useEffect(() => {
    if (!navRef.current || !activeTab) return
    const frameId = requestAnimationFrame(() => {
      const nav = navRef.current
      if (!nav) return

      const activeNode = nav.querySelector<HTMLElement>(
        `[data-page-tab="${CSS.escape(activeTab.to)}"]`,
      )
      if (!activeNode) return

      // 1. 物理可见性检测：判断激活标签是否已经完全处于可视区内部（留 10px 包含外翻倒角）
      const nodeRect = activeNode.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      const pad = 4
      const isLeftVisible = nodeRect.left >= navRect.left + pad
      const isRightVisible = nodeRect.right <= navRect.right - pad

      // 若已经完全可见：立即返回，绝不产生任何多余位移！
      if (isLeftVisible && isRightVisible) return

      // 2. 只有确实被遮挡出界时，才按需触发平滑带入
      const lastUnpinned = unpinnedEntries[unpinnedEntries.length - 1]
      const firstUnpinned = unpinnedEntries[0]

      if (lastUnpinned && activeTab.to === lastUnpinned.tab.to) {
        // 最后一个标签：直接滚到底，紧凑贴合不留 padding
        nav.scrollTo({ left: nav.scrollWidth, behavior: 'smooth' })
        return
      }

      if (firstUnpinned && activeTab.to === firstUnpinned.tab.to) {
        // 第一个标签：直接滚到最左起点
        nav.scrollTo({ left: 0, behavior: 'smooth' })
        return
      }

      // 中间标签：视口适度带入
      activeNode.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    })
    return () => cancelAnimationFrame(frameId)
  }, [activeTab?.to, tabs.length, unpinnedEntries])

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-1 self-stretch',
        className,
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
          <div className="flex h-full min-w-0 max-w-[80%] shrink items-center gap-1 no-drag">
            {pinnedEntries.length > 0 ? (
              <div className="flex h-full shrink-0 items-center">
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

            <div className="flex h-full min-w-0 flex-1 items-center">
              <nav
                ref={navRef}
                aria-label={t('pageTabs.label', '页面标签页')}
                data-page-tab-variant={variant}
                className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] outline-none focus:outline-none"
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
          </div>
        </SortableContext>
      </DndContext>

      {/* 「+」在滚动区之外、紧挨着它 —— 跟着标签走，不钉在行末 */}
      <div className="flex h-full shrink-0 items-center">
        <Tooltip
          content={`${newTabLabel} (${shortcutHint})`}
          render={
            <button
              type="button"
              onClick={handleOpenPalette}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={newTabLabel}
              className={cn(
                'no-drag relative flex shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-subtle transition-colors',
                variant === 'chrome' ? 'size-7' : 'size-8',
                'hover:bg-kumo-base/60 hover:text-kumo-default active:bg-kumo-base',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line',
              )}
            >
              <PlusIcon size={16} aria-hidden />
            </button>
          }
        />
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
