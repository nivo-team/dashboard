import { Badge, Tooltip } from '@cloudflare/kumo'
import type { ReactNode } from 'react'
import { cn } from '#/lib/cn'

export interface ArrayHoverCardProps {
  /** 悬浮卡片标题（可选）。 */
  title?: string
  /** 完整列表内容，每项一个节点。 */
  items: ReactNode[]
  /** 单元格内的摘要内容；缺省取 `items[0]`。 */
  summary?: ReactNode
  /** 无数据时的占位文案。 */
  emptyText?: string
  /** 触发区额外类名。 */
  className?: string
}

/**
 * 数组字段的悬浮卡片单元格。
 *
 * 表格列编排约定（一列只呈现一项数据）：
 * - 标量字段 → 独立成一列，单元格内只渲染这一个值；
 * - 嵌套对象 → 把内部字段展开成各自的列；
 * - 数组字段 → 单元格只显示摘要（默认首项）与剩余数量，hover / focus 时用悬浮卡片展开完整列表。
 */
export function ArrayHoverCard({
  title,
  items,
  summary,
  emptyText = '-',
  className,
}: ArrayHoverCardProps) {
  if (items.length === 0) {
    return <span className="text-sm text-kumo-subtle">{emptyText}</span>
  }

  const restCount = items.length - 1

  return (
    <Tooltip
      delay={120}
      side="top"
      align="start"
      className={cn('max-w-full', className)}
      content={
        <div className="flex max-w-64 flex-col gap-1.5">
          {title ? (
            <span className="text-xs font-medium text-kumo-subtle">{title}</span>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">{items}</div>
        </div>
      }
    >
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="truncate">{summary ?? items[0]}</span>
        {restCount > 0 ? <Badge variant="neutral">+{restCount}</Badge> : null}
      </span>
    </Tooltip>
  )
}
