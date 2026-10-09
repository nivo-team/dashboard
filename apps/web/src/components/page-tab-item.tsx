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
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
 * - `chrome`：桌面壳窗口条里那一条 —— **Chrome / Figma 那种连成一片的标签**：彼此没有间距、
 *   贴着窗口条下沿，激活态的整块形状（顶部圆角 + 底部外翻倒角 + 那条 1px 描边）
 *   由一条 **SVG 闭合路径**一次画完（见下面的 `buildTabShape`），
 *   而不是「圆角盒子 + 角上贴渐变」—— 后者在非整数缩放下会露白、接不上。
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
 * chrome 外观下标签的高度。**必须与 SVG 的 viewBox 高度一致**（两者一起决定形状），
 * 所以它只在这里定义一次：标签高度、SVG 高度、条上「+」那一行的高度都取它。
 */
export const CHROME_TAB_HEIGHT = 34

/**
 * 底部外翻倒角的半径（px）。也是形状向标签盒左右各探出的宽度。
 *
 * `#/components/page-tab-item` 用它生成路径，标签条左右留白也按它来。
 */
export const CHROME_TAB_FLARE = 8

/**
 * 形状四周留出的**余量**（px）。
 *
 * 描边以路径为中心、上下左右各探出 0.5px —— 不给余量就要靠 SVG 的 `overflow: visible`
 * 硬撑，那是各引擎行为不一致的地方（实测：顶部描边会被自己的视口裁掉，底部的溢出还会让
 * 标签条的 `overflow-x: auto` 多出一段可滚动区域）。留 1px 后描边完全落在视口内：
 * 不用 `overflow: visible`，也不会溢出到外面。
 */
const TAB_SHAPE_PAD = 1

/**
 * chrome 标签自己的边框宽度（`border`，1px）。
 *
 * 形状要靠它**补偿坐标**：绝对定位后代的包含块是祖先的 **padding box**，不是 border box ——
 * 而路径是照 border box（也就是标签看上去的那一圈）写的。不补偿就会整体偏 1px：
 * 形状往右挪 1px、右边还多探出 1px。
 */
const TAB_BORDER_WIDTH = 1

/** 还没量到标签宽度时用的兜底值：只影响形状的圆角比例，尺寸由 CSS 定，下一帧就纠正 */
const TAB_SHAPE_FALLBACK_WIDTH = 150

/**
 * 按标签的**实测宽度**生成 1:1 的路径与 viewBox。
 *
 * 为什么必须 1:1：形状靠 `preserveAspectRatio="none"` 随标签宽横向拉伸，
 * 而拉伸会把**顶部圆角也一起拉**（`x` 方向 8px 变成 8×拉伸比）—— 于是激活标签的顶角
 * 与未激活标签的 `rounded-t-lg`（永远 8px）对不上，肉眼一眼能看出来。
 * 把 viewBox 的宽度按实测像素写死，拉伸比就是 1，圆角与直边都不再变形。
 *
 * 坐标：SVG 视口 = 标签盒向左/右各 `倒角 + 余量`、上下各 `余量`。
 * 于是「标签左边」在坐标系里是 `倒角 + 余量`，「标签底边」是 `余量 + 标签高`。
 *
 * **下沿也要留余量**：外翻倒角那两段圆弧的末端落在标签底边上，描边以路径为中心、
 * 下半 0.5px 会探到底边之外 —— 不留余量就被 SVG 自己的视口切掉，圆弧末端只剩半条线，
 * 看着就是「倒角这里断了一截 / 像被往下压了 0.5px」（用户报过）。
 */
function buildTabShape(tabWidth: number) {
  const flare = CHROME_TAB_FLARE
  const pad = TAB_SHAPE_PAD
  const left = flare + pad // 标签左边
  const top = pad // 标签顶边
  const bottom = pad + CHROME_TAB_HEIGHT // 标签底边
  const right = left + tabWidth // 标签右边
  const width = tabWidth + (flare + pad) * 2 // 视口宽

  const outline = [
    // 左下外翻：sweep=0 → 圆心落在切口外侧，弧朝外鼓（凹圆角）
    `M ${pad},${bottom}`,
    `A ${flare},${flare} 0 0 0 ${left},${bottom - flare}`,
    `L ${left},${top + flare}`,
    // 左上凸圆角：sweep=1
    `A ${flare},${flare} 0 0 1 ${left + flare},${top}`,
    `L ${right - flare},${top}`,
    `A ${flare},${flare} 0 0 1 ${right},${top + flare}`,
    `L ${right},${bottom - flare}`,
    // 右下外翻：同样 sweep=0
    `A ${flare},${flare} 0 0 0 ${right + flare},${bottom}`,
  ].join(' ')

  return { outline, viewBox: `0 0 ${width} ${bottom + TAB_SHAPE_PAD}`, width, height: bottom }
}

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
    形状要按标签的**实测宽度**生成（理由见 `buildTabShape`）：靠 CSS 拉伸会让顶部圆角
    跟着变形，和未激活标签的 `rounded-t-lg` 对不上。这里量一次、之后由 ResizeObserver
    跟着内容变化（换语言、标题变长都会变宽）。
    没量到之前用一个兜底宽度：只影响圆角比例，尺寸仍由 CSS 定，下一帧就纠正。
  */
  const [shapeWidth, setShapeWidth] = useState<number | null>(null)
  const tabRef = useRef<HTMLDivElement | null>(null)
  /** 同一个节点要喂给两处：dnd-kit 的 `setNodeRef` 与自己的测量 ref */
  const setTabRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      tabRef.current = node
    },
    [setNodeRef],
  )

  useLayoutEffect(() => {
    // 只有激活标签需要（未激活标签的形状由 CSS 的 `rounded-t-lg` 负责）
    if (!chrome || !active) return
    const node = tabRef.current
    if (!node) return

    const measure = () => setShapeWidth(node.getBoundingClientRect().width)
    measure()

    // 环境里没有 ResizeObserver（老 WebKit）时退化成「只量一次」，形状依旧正确
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [chrome, active])

  const shape = buildTabShape(shapeWidth ?? TAB_SHAPE_FALLBACK_WIDTH)

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
        ref={setTabRef}
        data-page-tab={tab.to}
        data-active={active}
        className={cn(
          /*
            `isolate`（isolation: isolate）不是装饰：形状那块 SVG 用 `z-index: -1` 垫到内容
            之下，负值只在**自己的堆叠上下文**里才只压内容、不压到窗口条背景下面去。
            靠祖先恰好带 z-index 是碰运气（激活标签当前有 z-10，但那是叠放次序的事），
            这里显式建一个上下文，形状的层级就不再依赖别的类。
          */
          'group/tab relative isolate flex min-w-0 shrink-0 items-center',
          // 固定态是定宽小方块；普通标签给个上限，长标题才会截断而不是把标签撑宽
          pinned ? (chrome ? 'w-9' : 'w-8') : 'max-w-[200px]',
          // chrome 的高度由 CHROME_TAB_HEIGHT 定（要跟 SVG 的 viewBox 对上），plain 用 Tailwind 的 h-8
          // 圆角在 chrome 外观下由测量值决定（见下面的 style），plain 用 Tailwind 的 rounded-md
          // chrome 的顶部圆角固定 8px（`rounded-t-lg` = 0.5rem = CHROME_TAB_FLARE）：
          // 固定态与普通标签**必须一致** —— 之前那版"窄标签收小半径"会让两者对不上
          chrome ? 'rounded-t-lg border border-b-0' : 'h-8 rounded-md border',
          /*
            chrome 外观下**激活标签自己不画边框、不铺底色** —— 整块形状（含外翻倒角与
            那条 1px 描边）由下面的 SVG 一次画完。留 `border` 只是为了与未激活标签
            保持同样的盒模型，切换标签时内容不会跳 1px。
          */
          chrome
            ? active
              ? 'border-transparent'
              : // 窗口条本身已经是 tint，悬浮再叠 tint 等于没反应 → 悬浮是**提亮**（Chrome 的做法）
                'border-transparent hover:bg-kumo-base/60'
            : active
              ? 'bg-kumo-base [border-color:var(--shell-chrome-line)]'
              : 'border-transparent hover:bg-kumo-tint',
          stackClass,
        )}
        style={{
          // 另一组的标签不跟着动：位移与过渡都摘掉，它就停在原地
          transform: foreignGroup ? undefined : CSS.Transform.toString(transform),
          transition: foreignGroup ? undefined : transition,
          // chrome 的高度只在常量里写一次（SVG 的 viewBox 也用它）
          // chrome 的高度只在常量里写一次（SVG 的 viewBox 也用它）
          ...(chrome ? { height: CHROME_TAB_HEIGHT } : null),
        }}
      >
        {/*
          形状本体：一条**闭合路径**（填充）+ 一条**不闭合的同一路径**（描边）。
          描边单独一份是因为底面不能有线：`Z` 会把底边也描出来，而底边要留给下方工作区
          （标签底色压住底部那条分割线，与工作区连成一体）。
          `vector-effect: non-scaling-stroke` 保证拉伸时描边永远是 1px 的实心线 ——
          不像径向渐变那套，在 125% / 150% 这类非整数缩放下会露白或断裂。
        */}
        {chrome && active ? (
          <svg
            aria-hidden
            className="page-tab-shape"
            // 1:1 的坐标系（`buildTabShape` 按实测宽度生成），拉伸比为 1 → 圆角与直边都不变形
            viewBox={shape.viewBox}
            preserveAspectRatio="none"
            /*
              铺开范围：左右各 `倒角 + 余量`；顶部留 `余量`（描边上下各探出 0.5px，
              留在视口内就不必依赖 `overflow: visible`）；底部与标签齐平 —— 底面本来就开口。
            */
            style={{
              // `100%` / `inset` 都以 padding box 为准，所以要各补上边框宽度（见 TAB_BORDER_WIDTH）
              insetBlockStart: -(TAB_SHAPE_PAD + TAB_BORDER_WIDTH),
              // 上：余量 + 标签自己的边框；下：再留一个余量给倒角圆弧的下半
              height: `calc(100% + ${TAB_SHAPE_PAD * 2 + TAB_BORDER_WIDTH * 2}px)`,
              // 还没量到时先用 CSS 撑开（下一帧换成实测像素，两者数值一致）
              width:
                shapeWidth === null
                  ? `calc(100% + ${(CHROME_TAB_FLARE + TAB_SHAPE_PAD) * 2}px)`
                  : shape.width,
              insetInline: -(CHROME_TAB_FLARE + TAB_SHAPE_PAD + TAB_BORDER_WIDTH),
            }}
          >
            <path className="page-tab-shape-fill" d={`${shape.outline} Z`} />
            <path className="page-tab-shape-line" d={shape.outline} />
          </svg>
        ) : null}

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
              居中用 `inset-0` + `m-auto`（定宽定高盒子的经典居中），**不要**写成
              `end-0.5 top-1/2 -translate-y-1/2`：那样只垂直居中、水平被推到行尾
              （实测过：✕ 明显偏右）。`inset-0` 是对称的，RTL 下同样居中。
            */
            pinned
              ? 'absolute inset-0 m-auto hidden group-hover/tab:flex'
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
