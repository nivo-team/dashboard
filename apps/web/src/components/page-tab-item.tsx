import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DropdownMenu } from '@cloudflare/kumo'
import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  PushPinIcon,
  PushPinSlashIcon,
  XCircleIcon,
  XIcon,
  XSquareIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/cn'
import { isDesktop } from '#/desktop/bridge'
import type { PageTab } from '#/lib/page-tabs'

/**
 * 标签条上的**单个标签**：点击切换、中键 / ✕ 关闭、右键菜单、拖拽排序；固定的只显示图标。
 *
 * ## 两种外观（`variant`）
 *
 * 行为、菜单、拖拽完全一样：
 * - `chrome`：桌面壳窗口条里的胶囊标签，与侧边栏折叠按钮及历史导航同高（28px / h-7），
 *   上下边距对称居中对齐；
 * - `plain`：浏览器顶栏里的小卡片（默认 h-8 / 32px）。
 */

/** 标签上的动作。跳转与「关掉当前页之后去哪」都由 `#/components/page-tab-strip` 收口。 */
export interface TabActions {
  /** 切换到该标签（就是客户端跳转） */
  activate: (to: string) => void
  close: (to: string) => void
  closeOthers: (to: string) => void
  /** 关闭某一**物理**侧（`left` / `right`）的标签；RTL 下由调用方映射成渲染顺序的前后 */
  closeSide: (to: string, physical: 'left' | 'right') => void
  closeAll: () => void
  togglePinned: (to: string) => void
}

export type PageTabVariant = 'chrome' | 'plain'

/**
 * chrome 外观下标签的高度。与侧边栏收起按钮同高（28px / size-7）。
 */
export const CHROME_TAB_HEIGHT = 28

export const CHROME_TAB_FLARE = 0

/**
 * 拖拽刚结束的那一下 click 要忽略。
 *
 * dnd-kit 的 PointerSensor 只负责把元素挪过去，**不会**吞掉随后的 click ——
 * 指针抬起时往往还落在同一个标签上，于是「拖完排序」会被当成「点了这个标签」，页面直接跳走。
 * 用一个时间戳挡住这一下：200ms 够覆盖浏览器派发 click 的时机，又短到不影响真正的连点。
 */
let lastDragEndAt = 0

/** 拖拽结束时调用（由 `PageTabStrip` 的 `onDragEnd` / `onDragCancel` 收口）。 */
export function markDragEnd() {
  lastDragEndAt = Date.now()
}

function isClickAfterDrag(): boolean {
  return Date.now() - lastDragEndAt < 200
}

interface PageTabItemProps {
  tab: PageTab
  active: boolean
  variant: PageTabVariant
  actions: TabActions
  /** 全部标签（含自己）与自己在其中的下标：用来算「左侧 / 右侧还有没有可关的」 */
  tabs: PageTab[]
  index: number
  /**
   * 正在拖的那个标签是不是固定的（`null` = 没有拖拽进行中）。
   *
   * 与自己**不同组**时这个标签整个退出拖拽交互（既不能当落点，也不跟着位移）——
   * 固定的与未固定的是两个区段，拖动不该把另一段也带着动。
   */
  dragPinned: boolean | null
}

export function PageTabItem({
  tab,
  active,
  variant,
  actions,
  tabs,
  index,
  dragPinned,
}: PageTabItemProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  const pinned = !!tab.pinned

  /** 拖的是另一组的标签：自己这一组完全不参与（不可拖、不可落、不位移） */
  const foreignGroup = dragPinned !== null && dragPinned !== pinned

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.to,
    disabled: { draggable: foreignGroup, droppable: foreignGroup },
  })

  const stackClass = isDragging ? 'z-20 opacity-80' : active ? 'z-10' : undefined

  const label = tab.labelKey ? t(tab.labelKey, tab.label) : tab.label
  const chrome = variant === 'chrome'
  const TabIcon = tab.icon

  const closableBefore = tabs.slice(0, index).filter((item) => !item.pinned).length
  const closableAfter = tabs.slice(index + 1).filter((item) => !item.pinned).length

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(next) => {
        // 只认「关」：左键点标签同样会请求打开（Base UI 的点击语义），那一下不该弹菜单
        if (!next) setMenuOpen(false)
      }}
    >
      {/*
        外层 div：满高度（h-full）、无背景的可点击与可拖动区域。
        将点击与拖拽绑定于此，大幅扩展命中区域（纵向覆盖标题栏全高），
        无需精准点击内部 28px 矩形。
      */}
      <DropdownMenu.Trigger
        render={
          <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            data-page-tab={tab.to}
            data-active={active}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            aria-label={pinned ? label : undefined}
            title={label}
            tabIndex={0}
            onClick={() => {
              if (isClickAfterDrag()) return
              actions.activate(tab.to)
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return
              event.preventDefault()
              actions.close(tab.to)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenuOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                actions.activate(tab.to)
              }
            }}
            className={cn(
              'group/tab relative flex h-full shrink-0 cursor-pointer select-none items-center outline-none no-drag',
              stackClass,
            )}
            style={{
              // 另一组的标签不跟着动：位移与过渡都摘掉，它就停在原地
              transform: foreignGroup ? undefined : CSS.Transform.toString(transform),
              transition: foreignGroup ? undefined : transition,
            }}
          >
            {/*
              内层 div：视觉上的矩形样式（高度 28px / h-7，与侧边栏折叠按钮及历史导航严格同高居中）
            */}
            <div
              className={cn(
                'relative flex min-w-0 shrink-0 items-center rounded-md border transition-colors',
                pinned
                  ? chrome
                    ? 'size-7 justify-center p-0'
                    : 'size-8 justify-center p-0'
                  : chrome
                    ? 'h-7 max-w-[200px] gap-1.5 ps-2 pe-1'
                    : 'h-8 max-w-[200px] gap-1.5 ps-2 pe-1',
                active
                  ? isDesktop()
                    ? 'bg-kumo-canvas text-kumo-default font-medium shadow-2xs [border-color:var(--shell-chrome-line)]'
                    : 'bg-kumo-base text-kumo-default font-medium shadow-2xs [border-color:var(--shell-chrome-line)]'
                  : 'border-transparent text-kumo-subtle group-hover/tab:bg-kumo-base/60 group-hover/tab:text-kumo-default group-active/tab:bg-kumo-base',
              )}
            >
              {TabIcon ? (
                <TabIcon
                  size={14}
                  aria-hidden
                  className={cn(
                    'shrink-0',
                    active
                      ? 'text-kumo-default'
                      : 'text-kumo-subtle group-hover/tab:text-kumo-default group-focus-within/tab:text-kumo-default',
                    // 固定态：悬浮或聚焦时让位给 ✕，平时只显示居中图标
                    pinned && 'group-hover/tab:hidden group-focus-within/tab:hidden',
                  )}
                />
              ) : null}

              {pinned ? null : (
                <span
                  className={cn(
                    'truncate text-xs',
                    active
                      ? 'font-medium text-kumo-default'
                      : 'text-kumo-subtle group-hover/tab:text-kumo-default',
                  )}
                >
                  {label}
                </span>
              )}

              <button
                type="button"
                data-tab-close
                aria-label={t('pageTabs.close', { defaultValue: '关闭 {{label}}', label })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  actions.close(tab.to)
                }}
                className={cn(
                  'shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle transition-colors hover:bg-kumo-base/80 hover:text-kumo-default focus:text-kumo-default outline-none',
                  pinned
                    ? 'absolute inset-0 m-auto size-5 hidden group-hover/tab:flex group-focus-within/tab:flex'
                    : 'flex size-4 ms-auto',
                )}
              >
                <XIcon size={12} aria-hidden />
              </button>
            </div>
          </div>
        }
      />

      <DropdownMenu.Content align="start" side="bottom" sideOffset={2} className="w-48">
        <DropdownMenu.Item className="gap-2" onClick={() => actions.close(tab.to)}>
          <XIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          <span className="text-xs text-kumo-default">{t('pageTabs.closeTab', '关闭')}</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="gap-2"
          disabled={tabs.length <= 1}
          onClick={() => actions.closeOthers(tab.to)}
        >
          <XCircleIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          <span className="text-xs text-kumo-default">{t('pageTabs.closeOthers', '关闭其它')}</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="gap-2"
          disabled={closableBefore === 0}
          onClick={() => actions.closeSide(tab.to, 'left')}
        >
          <ArrowLineLeftIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          <span className="text-xs text-kumo-default">{t('pageTabs.closeLeft', '关闭左侧')}</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="gap-2"
          disabled={closableAfter === 0}
          onClick={() => actions.closeSide(tab.to, 'right')}
        >
          <ArrowLineRightIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          <span className="text-xs text-kumo-default">{t('pageTabs.closeRight', '关闭右侧')}</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item className="gap-2" onClick={actions.closeAll}>
          <XSquareIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          <span className="text-xs text-kumo-default">{t('pageTabs.closeAll', '关闭全部')}</span>
        </DropdownMenu.Item>

        <DropdownMenu.Separator />

        <DropdownMenu.Item className="gap-2" onClick={() => actions.togglePinned(tab.to)}>
          {pinned ? (
            <PushPinSlashIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          ) : (
            <PushPinIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
          )}
          <span className="text-xs text-kumo-default">
            {pinned ? t('pageTabs.unpin', '取消固定') : t('pageTabs.pin', '固定标签页')}
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
