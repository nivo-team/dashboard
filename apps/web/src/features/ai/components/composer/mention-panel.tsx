import { DropdownMenu } from '@cloudflare/kumo'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiRouteRefItem } from '#/features/ai/core'
import { cn } from '#/lib/cn'
import { buildMentionRowIndex, toMentionSections } from './mention'

/**
 * `@` 引用面板（命令面板的形态）：在输入框里打 `@`（或点「+」里的「引用位置」）就浮出来，
 * 可以引用「哪个模块 / 哪个页面 / 哪一条记录」。样式照命令面板来：**段标题 + 行**，
 * 行里是「名字 + 灰色语法 + 右侧说明」—— 名字是主行，找东西比看语法快。
 *
 * 弹出层用 Kumo `DropdownMenu`（底层 Base UI 的 Menu）：底色 / 圆角 / 阴影 / 进出场、
 * 点外面关闭、行的 hover / disabled 都白拿。
 *
 * **它没有 Trigger**：这块面板是「输入框里的文字驱动」的，没有哪颗按钮「属于」它；
 * 锚点显式给成整块输入区（`anchorRef`），所以不需要 Base UI 的触发元素。
 *
 * 三处刻意的参数，都是为了把它从「菜单抢焦点」掰回「输入框驱动」：
 *
 * - `modal={false}`：菜单默认是模态的（铺一层遮罩、锁页面滚动），而这块面板必须一边开着
 *   一边让人在**输入框里继续打字过滤**，遮罩会把输入框挡在外面。
 * - `highlightItemOnHover={false}`：Base UI 的菜单在鼠标扫过时会 focus 那一项，
 *   焦点一走输入框就收不到按键了；高亮改由我们自己的 `activeIndex` 标（见 Item 的 className）。
 * - Content 上的 `onFocus`：**焦点守卫** —— Base UI 开菜单时会把焦点送进第一项
 *   （而且那一跳排在下一帧，所以只在 `useLayoutEffect` 里抢一次是不够的）。焦点一进面板
 *   就立刻还给输入框：它是「输入框里的文字驱动」的，焦点走了用户就没法接着打字过滤了，
 *   键盘交互（↑↓ / Enter / Tab / Esc）统一由输入框的 `keydown` 处理。
 */
export function MentionPanel({
  open,
  onOpenChange,
  rows,
  query,
  activeIndex,
  onActiveChange,
  onPick,
  anchorRef,
  textareaRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前该显示的行（已按输入过滤，见 `matchMentionRows`） */
  rows: readonly AiRouteRefItem[]
  /** 输入框里正在打的 `@…`（用于「没有匹配」那句文案） */
  query: string
  /** 键盘与鼠标**共用**的那一份「当前行」（焦点留在输入框里，所以高亮得自己记） */
  activeIndex: number
  onActiveChange: (index: number) => void
  onPick: (row: AiRouteRefItem) => void
  /** 整块输入区 —— 面板贴着它的上沿浮出来 */
  anchorRef: RefObject<HTMLDivElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const { t } = useTranslation('ai')
  const sections = toMentionSections(rows)
  const rowIndex = buildMentionRowIndex(rows)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      highlightItemOnHover={false}
    >
      <DropdownMenu.Content
        side="top"
        align="start"
        anchor={anchorRef}
        /*
          宽度跟输入框一致；高度按住 Base UI 给的可用高度 —— 输入区贴在面板底部，
          万一上方放不下，Base UI 自己会翻到下面去（`--available-height` 保证它不溢出）。
        */
        className="w-[var(--anchor-width)] max-h-[min(24rem,var(--available-height))]"
        onFocus={() => textareaRef.current?.focus({ preventScroll: true })}
      >
        {sections.map((section) => (
          <DropdownMenu.Group key={section.kind}>
            <DropdownMenu.Label className="px-2 pt-2 pb-1 text-xs font-medium text-kumo-subtle">
              {t(section.labelKey, section.fallback)}
            </DropdownMenu.Label>
            {section.rows.map((row) => {
              const RowIcon = row.icon
              const index = rowIndex.get(row.id) ?? 0
              const active = index === activeIndex
              return (
                <DropdownMenu.Item
                  key={row.id}
                  /*
                    键盘选中的那一行由**我们自己**标（焦点始终留在输入框里，Base UI 内部那份高亮
                    跟不到我们的键盘游标），所以用 `bg-kumo-tint` 显式画出来 ——
                    与 Kumo 给 `data-highlighted` 用的 `bg-kumo-overlay` 是同色阶的近邻，
                    鼠标扫过与 ↑↓ 移动看起来没有差别。
                  */
                  className={cn('items-center gap-2 py-1.5', active && 'bg-kumo-tint')}
                  onClick={() => onPick(row)}
                  // 鼠标扫过也同步给键盘用的那份「当前行」，两种输入方式不会各记一份
                  onMouseMove={() => onActiveChange(index)}
                >
                  <RowIcon size={15} className="shrink-0 text-kumo-subtle" />
                  {/* 主行是**名字**（表格示例）——语法在右边，灰一点、小一号 */}
                  <span className="shrink-0 truncate text-sm text-kumo-default">{row.name}</span>
                  {row.syntax ? (
                    <span className="shrink-0 font-mono text-xs text-kumo-subtle">
                      {row.syntax}
                    </span>
                  ) : null}
                  {/* 右侧说明：空间不够时先牺牲它（`min-w-0` + truncate） */}
                  <span className="ms-auto min-w-0 truncate text-xs text-kumo-subtle">
                    {row.description}
                  </span>
                  {/*
                    当前行给出「按 Tab 就能选中」的提示（命令面板里也是这个写法）。
                    只在当前行出现，所以面板整体不吵；`shrink-0` 保证它不被挤掉。
                  */}
                  {active ? (
                    <span className="ms-1 shrink-0 rounded border border-kumo-line px-1 text-[10px] text-kumo-subtle">
                      Tab
                    </span>
                  ) : null}
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Group>
        ))}

        {/* 认不出来的引用不静默：说清「没匹配上」，而不是把面板收掉让人以为坏了 */}
        {rows.length === 0 ? (
          <p className="flex h-8 items-center px-2 text-xs text-kumo-subtle">
            {t('promptMentionNoMatch', {
              query,
              defaultValue: '没有匹配“{{query}}”的引用',
            })}
          </p>
        ) : null}

        <p className="mt-1 border-t border-kumo-line px-2 pt-1.5 pb-1 text-[11px] text-kumo-subtle">
          {t('promptMentionHint', '输入以筛选；@模块:ID 可引用某一条记录')}
        </p>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
