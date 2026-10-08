import { Badge, Table } from '@cloudflare/kumo'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createColumnHelper } from '#/components/data-table'
import type { ColumnDef, StockFeatures } from '#/components/data-table'
import type { ComplexTableRow } from './data'

/** 数据列统一最小宽度。 */
const MIN_COLUMN_WIDTH = 'min-w-[120px]'

const columnHelper = createColumnHelper<StockFeatures, ComplexTableRow>()

/** 状态 → 徽章样式（只映射到本仓实际用过的变体）。 */
const STATUS_VARIANT: Record<string, 'success' | 'primary' | 'neutral'> = {
  active: 'success',
  pending: 'primary',
  done: 'neutral',
}

/**
 * 「复杂表格」示例的列编排 —— 用**分组表头**把字段归类：
 * 基本信息 / 分类与状态 / 金额。多级表头由 TanStack Table 的 group 列原生支持，
 * `DataTable` 已经按 `getHeaderGroups()` 逐行渲染。
 */
export function useComplexTableColumns(): ColumnDef<StockFeatures, ComplexTableRow>[] {
  const { t } = useTranslation('complex-table')

  return useMemo(() => {
    const label = (key: string, fallback: string) => t(`columns.${key}`, fallback)

    return columnHelper.columns([
      // 多选列：DataTable 对 id === 'select' 有特殊处理（CheckHead / CheckCell 自带 th/td）
      columnHelper.display({
        id: 'select',
        enableHiding: false,
        header: ({ table }) => (
          <Table.CheckHead
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
            aria-label={t('cell.selectAll', '全选当前页')}
          />
        ),
        cell: ({ row }) => (
          <Table.CheckCell
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label={t('cell.selectRow', '选择 {{name}}', { name: row.original.name })}
          />
        ),
      }),

      columnHelper.group({
        id: 'basic',
        header: t('groups.basic', '基本信息'),
        columns: columnHelper.columns([
          columnHelper.accessor('id', {
            id: 'id',
            header: label('id', '订单 / 明细号'),
            // 树列（第一个可见数据列）承担层级缩进与展开控件，宽度要留够
            meta: { label: label('id', '订单 / 明细号'), headerClassName: 'min-w-[180px]' },
            cell: ({ getValue }) => (
              <span className="font-mono text-xs text-kumo-default">{getValue()}</span>
            ),
          }),
          columnHelper.accessor('name', {
            id: 'name',
            header: label('name', '名称'),
            meta: { label: label('name', '名称'), headerClassName: MIN_COLUMN_WIDTH },
          }),
        ]),
      }),

      columnHelper.group({
        id: 'category',
        header: t('groups.category', '分类与状态'),
        columns: columnHelper.columns([
          columnHelper.accessor('category', {
            id: 'category',
            header: label('category', '分类'),
            meta: { label: label('category', '分类'), headerClassName: MIN_COLUMN_WIDTH },
          }),
          columnHelper.accessor('status', {
            id: 'status',
            header: label('status', '状态'),
            meta: { label: label('status', '状态'), headerClassName: MIN_COLUMN_WIDTH },
            cell: ({ getValue }) => {
              const value = String(getValue() ?? '')
              return (
                <Badge variant={STATUS_VARIANT[value] ?? 'neutral'} appearance="dot">
                  {t(`status.${value}`, value)}
                </Badge>
              )
            },
          }),
        ]),
      }),

      columnHelper.group({
        id: 'amount',
        header: t('groups.amount', '数量与金额'),
        columns: columnHelper.columns([
          columnHelper.accessor('qty', {
            id: 'qty',
            header: label('qty', '数量'),
            meta: { label: label('qty', '数量'), headerClassName: MIN_COLUMN_WIDTH },
            cell: ({ getValue }) => <span className="tabular-nums">{String(getValue() ?? 0)}</span>,
          }),
          columnHelper.accessor('unitPrice', {
            id: 'unitPrice',
            header: label('unitPrice', '单价'),
            meta: { label: label('unitPrice', '单价'), headerClassName: MIN_COLUMN_WIDTH },
            cell: ({ getValue }) => (
              <span className="tabular-nums">{Number(getValue() ?? 0).toLocaleString()}</span>
            ),
          }),
          columnHelper.accessor('amount', {
            id: 'amount',
            header: label('amount', '金额'),
            meta: {
              label: label('amount', '金额'),
              headerClassName: MIN_COLUMN_WIDTH,
              cellClassName: 'text-end',
            },
            cell: ({ getValue }) => (
              <span className="tabular-nums font-medium">
                {Number(getValue() ?? 0).toLocaleString()}
              </span>
            ),
          }),
        ]),
      }),
    ])
  }, [t])
}
