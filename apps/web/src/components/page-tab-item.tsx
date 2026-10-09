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
import type { PageTab } from '#/lib/page-tabs'

/**
 * 标签条上的**单个标签**：点击切换、中键 / ✕ 关闭、右键菜单、拖拽排序；固定的只显示图标。
 *
 * ## 两种外观（`variant`）
 *
 * 行为、菜单、拖拽完全一样，只有几何与配色不同：
 *
 * - `chrome`：桌面壳窗口条里那一条 —— **Chrome 那种连成一片的标签**：彼此没有间距、
 *   贴着窗口条下沿、只圆上面两个角，激活态相当于「抬起来」的那一张（浅底 + 描边 + 深色字）。
 *   相邻的两个**未激活**标签之间有一条细分隔线（`src/styles.css` 里按
 *   `data-page-tab` / `data-active` 画），这是 Chrome 标签条最好认的特征；
 * - `plain`：浏览器顶栏里的小卡片（默认）：彼此留间距、四角都圆的独立小块。
 *
 * ## 拖拽的把柄是**标签内容**（`listeners` 挂在内容按钮上，不是整块）
 *
 * 「按住标签往旁边拖」= 排序；关闭按钮在把柄之外，从 ✕ 上起手不会误触发排序。
 * 抬手指后浏览器仍会补一个 click，`isClickAfterDrag()` 把它挡掉，否则拖完就会跳页。
 * 键盘拖拽（dnd-kit 的 KeyboardSensor）**刻意没开**：它的激活键就是空格 / 回车，
 * 那正是标签本来的「激活」键，两者会互相抢。
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

  /*
    叠放次序 —— 激活的必须压在邻居之上：它的**倒角与描边长在盒外**（左右各探出 7px），
    邻居一悬浮就有了底色，后画的兄弟会直接糊在这对倒角上（右侧那个尤其明显）。
    拖拽中的再高一层，盖过激活标签，才看得清被拖着的是哪一个。
    写成三目而不是叠加：本仓的 `cn` 只拼接，两个 z-* 同时在场就只剩源码顺序可赌。
  */
  const stackClass = isDragging ? 'z-20 opacity-80' : active ? 'z-10' : undefined

  const label = tab.labelKey ? t(tab.labelKey, tab.label) : tab.label
  const chrome = variant === 'chrome'
  const TabIcon = tab.icon

  /*
    右键菜单的可用性：**固定的标签不参与「关闭左侧 / 右侧」**（固定就是「别动它」），
    所以某一侧只剩固定标签时那两项是禁用的。
  */
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
        可排序的**根**是这一层（`setNodeRef` + 位移）：拖拽时动的是整块（含 ✕），
        而把柄（`listeners`）只挂在内容按钮上 —— 从 ✕ 上起手不会误触发排序。
      */}
      <div
        ref={setNodeRef}
        style={{
          // 另一组的标签不跟着动：位移与过渡都摘掉，它就停在原地
          transform: foreignGroup ? undefined : CSS.Transform.toString(transform),
          transition: foreignGroup ? undefined : transition,
        }}
        data-page-tab={tab.to}
        data-active={active}
        className={cn(
          'group/tab relative flex min-w-0 shrink-0 items-center',
          // 固定态是定宽小方块；普通标签给个上限，长标题才会截断而不是把标签撑宽
          pinned ? (chrome ? 'w-9' : 'w-8') : 'max-w-[200px]',
          chrome ? 'h-[34px] rounded-t-lg border border-b-0' : 'h-8 rounded-md border',
          // 描边与窗口条下边线、倒角圆弧同色（实色，见 styles.css 的 `--shell-chrome-line`）
          active
            ? 'bg-kumo-base [border-color:var(--shell-chrome-line)]'
            : 'border-transparent hover:bg-kumo-tint',
          stackClass,
        )}
      >
        <DropdownMenu.Trigger
          render={
            <button
              type="button"
              {...attributes}
              {...listeners}
              title={label}
              aria-current={active ? 'page' : undefined}
              // 固定态只有图标，可访问名称得自己给
              aria-label={pinned ? label : undefined}
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
              className={cn(
                'flex h-full min-w-0 flex-1 cursor-pointer items-center',
                pinned ? 'justify-center' : 'gap-1.5 ps-2.5 text-start',
              )}
            >
              {TabIcon ? (
                <TabIcon
                  size={14}
                  aria-hidden
                  className={cn(
                    'shrink-0',
                    active ? 'text-kumo-default' : 'text-kumo-subtle',
                    // 固定态：悬浮时让位给 ✕（Chrome 就是这么做的），平时只显示图标
                    pinned && 'group-hover/tab:hidden',
                  )}
                />
              ) : null}

              {pinned ? null : (
                <span
                  className={cn(
                    'truncate text-sm',
                    active ? 'font-medium text-kumo-default' : 'text-kumo-subtle',
                  )}
                >
                  {label}
                </span>
              )}
            </button>
          }
        />

        <button
          type="button"
          aria-label={t('pageTabs.close', { defaultValue: '关闭 {{label}}', label })}
          onClick={() => actions.close(tab.to)}
          className={cn(
            'size-5 shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default',
            /*
              固定态：`✕` **绝对定位叠在图标上**（悬浮时图标让位）—— 36px 的小方块里
              放不下「图标 + 关闭」两个元素，并排会把图标挤扁。
            */
            pinned
              ? 'absolute end-0.5 top-1/2 hidden -translate-y-1/2 group-hover/tab:flex'
              : cn('flex', chrome ? 'me-1' : 'me-0.5'),
          )}
        >
          <XIcon size={12} aria-hidden />
        </button>
      </div>

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
