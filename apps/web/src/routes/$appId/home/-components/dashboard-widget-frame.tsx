import { cn, LayerCard } from '@cloudflare/kumo'
import type { Icon } from '@phosphor-icons/react'
import { ArrowsOutSimpleIcon, DotsSixVerticalIcon, XIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

/**
 * 仪表盘卡片的统一外壳（含编辑态）。
 *
 * 抽出这一层是为了让**编辑能力只实现一次**：卡片组件自己只渲染内容，
 * 标题、图标、拖拽手柄、移除按钮、缩放手柄都由这里统一提供。
 * 否则每加一张卡片都要重复实现一遍编辑态，漏一处就会出现
 * 「这张卡片在自定义模式下拖不动、也删不掉」的怪现象。
 *
 * 交互回调（`onDragHandlePointerDown` 等）**由栅格传入**：这个组件只管长什么样，
 * 不知道坐标怎么算、也不知道布局存在哪 —— 位置计算全部收敛在 `DashboardGrid`。
 */
interface DashboardWidgetFrameProps {
  title: string
  icon: Icon
  /** 是否处于自定义模式。 */
  editing: boolean
  /** 是否正在被拖动（用于抬高层级与降低透明度）。 */
  dragging?: boolean
  /** 是否允许拖拽 / 缩放（移动端为 false：窄屏放不下 8 列，拖动没有意义）。 */
  interactive?: boolean
  onRemove?: () => void

  onDragHandlePointerDown?: (event: PointerEvent<HTMLElement>) => void
  onDragHandleKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onResizeHandlePointerDown?: (event: PointerEvent<HTMLElement>) => void
  onResizeHandleKeyDown?: (event: KeyboardEvent<HTMLElement>) => void

  children: ReactNode
}

export function DashboardWidgetFrame({
  title,
  icon: IconComponent,
  editing,
  dragging = false,
  interactive = true,
  onRemove,
  onDragHandlePointerDown,
  onDragHandleKeyDown,
  onResizeHandlePointerDown,
  onResizeHandleKeyDown,
  children,
}: DashboardWidgetFrameProps) {
  const { t } = useTranslation('dashboard')

  return (
    <LayerCard
      className={cn(
        'relative flex h-full flex-col p-0 transition-shadow',
        // 拖动中的卡片：抬起来一点，让「正在移动的是它」一眼可见
        dragging && 'z-10 shadow-lg ring-2 ring-kumo-brand/40',
        // 自定义模式下所有卡片都描一圈品牌色细环，明确「现在可以动它们」
        editing && !dragging && 'ring-1 ring-kumo-brand/30',
      )}
    >
      <LayerCard.Secondary className="my-0 shrink-0 gap-2 py-2 ps-2 pe-3">
        {editing && interactive ? (
          <button
            type="button"
            // 手柄是纯拖拽热区，可访问名称给读屏用；键盘用户走 onKeyDown 的
            // 方向键移动（见 DashboardGrid），所以它必须是真正可聚焦的 button。
            aria-label={t('edit.dragHandle', '拖动卡片')}
            title={t('edit.dragHandle', '拖动卡片')}
            onPointerDown={onDragHandlePointerDown}
            onKeyDown={onDragHandleKeyDown}
            className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default active:cursor-grabbing"
          >
            <DotsSixVerticalIcon size={16} aria-hidden />
          </button>
        ) : IconComponent ? (
          // 非编辑模式、以及**移动端的编辑模式**（窄屏放不下 8 列，拖动没有意义）
          // 都退回普通图标：给一个按不动的灰色手柄，只会让人反复去试
          <IconComponent size={16} className="ms-1 shrink-0 text-kumo-subtle" aria-hidden />
        ) : null}

        <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
          {title}
        </span>

        {editing ? (
          <button
            type="button"
            aria-label={t('edit.remove', '移除卡片')}
            title={t('edit.remove', '移除卡片')}
            onClick={onRemove}
            className="flex size-6 shrink-0 items-center justify-center rounded text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-danger"
          >
            <XIcon size={14} aria-hidden />
          </button>
        ) : null}
      </LayerCard.Secondary>

      <LayerCard.Primary
        className={cn(
          'min-h-0 flex-1 gap-0 overflow-y-auto p-4',
          // 自定义模式下卡片内容不可交互：否则点「快捷入口」里的链接会直接跳走，
          // 用户正想拖动这张卡片却离开了页面。编辑态下「只有手柄是可点的」这条规则更简单可靠。
          editing && 'pointer-events-none select-none',
        )}
      >
        {children}
      </LayerCard.Primary>

      {editing && interactive ? (
        <button
          type="button"
          aria-label={t('edit.resizeHandle', '调整卡片大小')}
          title={t('edit.resizeHandle', '调整卡片大小')}
          onPointerDown={onResizeHandlePointerDown}
          onKeyDown={onResizeHandleKeyDown}
          // 逻辑属性（end / bottom）：RTL 下自动落到左下角；
          // 光标是物理方向，跟着换一次（右下角是 nwse，左下角是 nesw）
          className="absolute end-1 bottom-1 flex size-6 cursor-nwse-resize touch-none items-center justify-center rounded text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default rtl:cursor-nesw-resize"
        >
          <ArrowsOutSimpleIcon size={14} aria-hidden />
        </button>
      ) : null}
    </LayerCard>
  )
}
