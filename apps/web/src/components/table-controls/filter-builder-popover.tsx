import { Badge, Button, Popover } from '@cloudflare/kumo'
import { FunnelIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { FilterControlProps } from './types'

/**
 * Filters 高级过滤器气泡浮层触发器与容器
 */
export function FilterBuilderPopover({
  activeCount = 0,
  triggerLabel,
  children,
  open,
  onOpenChange,
}: FilterControlProps) {
  const { t } = useTranslation()
  const resolvedTriggerLabel = triggerLabel ?? t('table.filters.trigger', '筛选')

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            variant="secondary"
            size="base"
            icon={<FunnelIcon size={16} />}
            aria-label={resolvedTriggerLabel}
          >
            {resolvedTriggerLabel}
            {activeCount > 0 ? (
              <Badge variant="primary" className="ms-1.5 px-1.5 py-0 text-xs">
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      {/*
        浮层高度上限 500px：条件行再多也不会把浮层撑高，
        超出的部分由内部条件列表滚动承担（见 FilterBuilder 的 flex-1 + overflow-y-auto）。
        外层再套一层 calc(100vh-200px) 仅作小视口兜底，避免浮层高出视口。
      */}
      <Popover.Content className="flex max-h-[min(500px,calc(100vh-200px))] w-[min(560px,calc(100vw-2rem))] flex-col p-4">
        {children}
      </Popover.Content>
    </Popover>
  )
}
