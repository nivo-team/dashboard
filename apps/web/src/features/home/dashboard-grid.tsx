import { WarningCircleIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { DASHBOARD_COLUMNS, DASHBOARD_GAP, DASHBOARD_ROW_HEIGHT } from '#/lib/dashboard-constants'
import type { DashboardWidget } from '#/lib/dashboard-layout'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useDashboardGrid } from './use-dashboard-grid'
import { getWidgetDefinition } from './widget-registry'
import { DashboardWidgetFrame } from './dashboard-widget-frame'

/**
 * 仪表盘栅格。
 *
 * 布局方式取决于视口，且是**两种完全不同的形态**（不是同一套 CSS 的响应式收放）：
 * - 桌面端：8 列栅格 + 固定行高（`grid-auto-rows`），每张卡片用
 *   `grid-column` / `grid-row` 显式定位 —— 位置来自布局数据，用户拖到哪就是哪；
 * - 移动端：**单列堆叠**，忽略全部坐标与宽度，行高改 `auto` 让内容自己决定高度。
 *   窄屏放不下 8 列（一列只有 30px），硬按坐标渲染只会得到一堆挤扁的卡片。
 *
 * RTL 不需要额外处理：`grid-column-start` 本身是**书写方向敏感**的，
 * 在 `dir="rtl"` 下 x=0 自动落在最右侧 —— 这正是镜像布局想要的结果。
 * （拖动时的列方向换算在 `useDashboardGrid` 里单独处理。）
 */
interface DashboardGridProps {
  widgets: DashboardWidget[]
  /** 自定义模式。 */
  editing: boolean
  onChange: (widgets: DashboardWidget[]) => void
  onRemove: (id: string) => void
}

export function DashboardGrid({ widgets, editing, onChange, onRemove }: DashboardGridProps) {
  const { t } = useTranslation('dashboard')
  const isMobile = useIsMobileViewport()
  // 移动端不给拖拽 / 缩放：8 列不存在，拖动只能横着跑偏；缩放手柄也压住了卡片内容
  const interactive = editing && !isMobile

  const { gridRef, layout, activeId, startMove, startResize, nudgeMove, nudgeResize } =
    useDashboardGrid({ widgets, enabled: interactive, onCommit: onChange })

  return (
    <div
      ref={gridRef}
      className="grid"
      style={
        isMobile
          ? { gridTemplateColumns: 'minmax(0, 1fr)', gap: DASHBOARD_GAP }
          : {
              gridTemplateColumns: `repeat(${DASHBOARD_COLUMNS}, minmax(0, 1fr))`,
              gridAutoRows: `${DASHBOARD_ROW_HEIGHT}px`,
              gap: DASHBOARD_GAP,
            }
      }
    >
      {layout.map((widget) => {
        const definition = getWidgetDefinition(widget.type)
        const Content = definition?.content
        const title = definition
          ? t(definition.titleKey, definition.type)
          : t('cards.unknown.title', '未知卡片')

        return (
          <div
            key={widget.id}
            // 显式定位只在桌面端给；移动端留空 → 单列自然堆叠、行高自适应
            style={
              isMobile
                ? undefined
                : {
                    gridColumn: `${widget.x + 1} / span ${widget.w}`,
                    gridRow: `${widget.y + 1} / span ${widget.h}`,
                  }
            }
            className="min-w-0"
          >
            <DashboardWidgetFrame
              title={title}
              icon={definition?.icon ?? WarningCircleIcon}
              editing={editing}
              interactive={interactive}
              dragging={activeId === widget.id}
              onRemove={() => onRemove(widget.id)}
              onDragHandlePointerDown={(event) => startMove(widget, event)}
              onDragHandleKeyDown={(event) => nudgeMove(widget, event)}
              onResizeHandlePointerDown={(event) => startResize(widget, event)}
              onResizeHandleKeyDown={(event) => nudgeResize(widget, event)}
            >
              {Content ? (
                <Content />
              ) : (
                // 存档里出现了当前版本没有的卡片类型：**保留并提示**，不要静默丢弃 ——
                // 否则用户切回旧版本（或某个卡片被临时下线）时布局会被悄悄改掉。
                <div className="flex h-full items-start gap-2 text-sm text-kumo-subtle">
                  <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <p className="min-w-0">
                    {t(
                      'cards.unknown.description',
                      '卡片「{{type}}」在当前版本中不可用，可移除后重新添加',
                      { type: widget.type },
                    )}
                  </p>
                </div>
              )}
            </DashboardWidgetFrame>
          </div>
        )
      })}
    </div>
  )
}
