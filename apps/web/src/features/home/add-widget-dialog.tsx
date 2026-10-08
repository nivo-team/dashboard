import { Badge, cn, LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { DashboardWidget } from '#/lib/dashboard-layout'
import { DASHBOARD_WIDGETS } from './widget-registry'

/**
 * 「添加卡片」面板。
 *
 * 用 `LayerDialog` 而不是下拉菜单：卡片列表要同时表达**名称与用途**（两行文案），
 * 下拉项塞不下；而且卡片数量将来会增长，对话框才有列表的滚动空间。
 *
 * 已存在且不允许重复的卡片会**置灰并标注「已添加」**（而不是隐藏）：
 * 隐藏会让用户以为「这张卡片没了」，置灰则明确表达「已经在页面上了」。
 */
interface AddWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前布局（用于判断哪些卡片已添加）。 */
  widgets: DashboardWidget[]
  onAdd: (type: string) => void
}

export function AddWidgetDialog({ open, onOpenChange, widgets, onAdd }: AddWidgetDialogProps) {
  const { t } = useTranslation('dashboard')

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('edit.addCard', '添加卡片')}</LayerDialog.Title>
        <LayerDialog.Description>
          {t('edit.addCardDescription', '选择要放到仪表盘上的卡片，可随时移除。')}
        </LayerDialog.Description>

        <LayerDialog.Body>
          <ul className="flex flex-col gap-2">
            {DASHBOARD_WIDGETS.map((definition) => {
              const addedCount = widgets.filter((widget) => widget.type === definition.type).length
              const duplicateBlocked = definition.allowMultiple === false && addedCount > 0
              const IconComponent = definition.icon

              return (
                <li key={definition.type}>
                  <button
                    type="button"
                    disabled={duplicateBlocked}
                    onClick={() => {
                      onAdd(definition.type)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg p-3 text-start ring ring-kumo-line transition-colors',
                      duplicateBlocked ? 'cursor-not-allowed opacity-55' : 'hover:bg-kumo-tint',
                    )}
                  >
                    <IconComponent
                      size={18}
                      className="mt-0.5 shrink-0 text-kumo-subtle"
                      aria-hidden
                    />

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-kumo-default">
                        {t(definition.titleKey, definition.type)}
                      </span>
                      {definition.descriptionKey ? (
                        <span className="text-xs text-kumo-subtle">
                          {t(definition.descriptionKey)}
                        </span>
                      ) : null}
                    </span>

                    {duplicateBlocked ? (
                      <Badge variant="secondary" className="mt-0.5 shrink-0">
                        {t('edit.added', '已添加')}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
