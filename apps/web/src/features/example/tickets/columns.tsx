import type { TicketItem } from '#/api'
import type { SchemaColumnSpec } from '#/components/data-table'

/**
 * 工单列表的列编排（顺序即白名单）。
 *
 * 一列只呈现一项数据：标量字段独占一列，文案统一取 `tickets:columns.<字段名>`。
 */

/** 数据列统一最小宽度：宽表下避免列被挤压成折行。 */
export const MIN_COLUMN_WIDTH = 'min-w-[110px]'

/** 默认隐藏的列：描述较长，默认收起（用户可在「显示选项」里打开）。 */
export const DEFAULT_HIDDEN_COLUMNS = ['description'] as const

/** 列顺序即白名单（列 id = 后端字段名）。 */
export const TICKET_COLUMN_SPECS: SchemaColumnSpec<TicketItem>[] = [
  { field: 'title', render: 'code' },
  { field: 'id', render: 'code' },
  { field: 'status', render: 'code' },
  { field: 'priority', render: 'code' },
  { field: 'assignee', render: 'code' },
  { field: 'category', render: 'code' },
  { field: 'description', render: 'code' },
  { field: 'created_at' },
  { field: 'updated_at' },
]

/** 可排序列（列 id 与后端 field 参数一致）。 */
export const TICKET_SORTABLE_FIELDS = [
  'id',
  'title',
  'status',
  'priority',
  'created_at',
  'updated_at',
] as const
