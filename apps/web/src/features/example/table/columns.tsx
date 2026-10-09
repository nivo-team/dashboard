import type { UserItem } from '#/api'
import type { SchemaColumnSpec } from '#/components/data-table'

/**
 * 表格示例的列编排（顺序即白名单）。
 *
 * 一列只呈现一项数据：标量字段独占一列。文案统一取
 * `table-example:columns.<字段名>`，新增字段只需补 i18n。
 */

/** 数据列统一最小宽度：宽表下避免列被挤压成折行。 */
export const MIN_COLUMN_WIDTH = 'min-w-[120px]'

/** 默认隐藏的列：默认不隐藏（「显示选项」是临时收起工具，不是设计上的默认收起项）。 */
export const DEFAULT_HIDDEN_COLUMNS = [] as const

/** 列顺序即白名单（列 id = 后端字段名）。 */
export const TABLE_EXAMPLE_COLUMN_SPECS: SchemaColumnSpec<UserItem>[] = [
  { field: 'nickname', render: 'userName' },
  { field: 'id', render: 'code' },
  { field: 'email', render: 'code' },
  { field: 'createtime' },
  { field: 'logintime' },
]
