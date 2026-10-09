import { Badge, Table } from '@cloudflare/kumo'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createColumnHelper } from '#/components/data-table'
import type { ColumnDef, StockFeatures } from '#/components/data-table'
import { useTimezone } from '#/lib/format'
import type { ComplexTableRow, OrderStatus, PayStatus } from './data'

/** 数据列统一最小宽度。 */
const MIN_COLUMN_WIDTH = 'min-w-[120px]'

const columnHelper = createColumnHelper<StockFeatures, ComplexTableRow>()

/*
  徽章变体**只能**取 Kumo Badge 的合法集合：
  `primary | secondary | error | warning | success | info | outline | beta`。
  用之前先查官方 registry（`npx @cloudflare/kumo doc Badge`），
  不要凭印象写 `neutral` / `danger` / `green` 这类不在集合里的名字 —— 它们会被静默忽略。
*/
type BadgeVariant = 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info' | 'outline' | 'beta'

/** 订单状态 → 徽章变体。 */
const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  pending: 'secondary',
  processing: 'primary',
  shipped: 'warning',
  done: 'success',
  cancelled: 'error',
}

/** 支付状态 → 徽章变体。 */
const PAY_STATUS_VARIANT: Record<PayStatus, BadgeVariant> = {
  unpaid: 'error',
  partial: 'warning',
  paid: 'success',
  refunded: 'secondary',
}

/** 金额列格式化（带千分位）。 */
const money = (value: unknown) => Number(value ?? 0).toLocaleString()

/**
 * 「复杂表格」示例的列编排 —— **25 个字段、单层表头**。
 *
 * 刻意**不做分组表头**：分组表头会多占一行表头空间，而本页要演示的是「宽表 + 全字段
 * 可筛选」，一行表头 + 横向滚动才是这类页面的真实形态（分组表头另有示例页）。
 *
 * 字段顺序、`meta.label` 与筛选目录（`filter-fields.ts`）、数据字段（`data.ts`）
 * 三处同源 —— 改字段时三处一起改，不要只改一处。
 */
export function useComplexTableColumns(): ColumnDef<StockFeatures, ComplexTableRow>[] {
  const { t } = useTranslation('example', { keyPrefix: 'complex-table' })
  const { formatDateTime } = useTimezone()

  /** 秒级 / 毫秒级时间戳统一格式化（随全局时区变化）。 */
  const formatTimestamp = (value: unknown) => {
    const timestamp = Number(value ?? 0)
    if (!timestamp) return '-'
    return formatDateTime(timestamp < 1e11 ? timestamp * 1000 : timestamp)
  }

  return useMemo(() => {
    /** 列文案：取 `example:complex-table.columns.<字段>`。 */
    const label = (key: keyof ComplexTableRow) => t(`columns.${key}`, key)

    /** 常规文本列（避免 25 列重复写 meta）。 */
    const text = (key: keyof ComplexTableRow, options?: { mono?: boolean; minWidth?: string }) =>
      columnHelper.accessor(key, {
        id: key,
        header: label(key),
        meta: {
          label: label(key),
          headerClassName: options?.minWidth ?? MIN_COLUMN_WIDTH,
        },
        cell: options?.mono
          ? ({ getValue }) => (
              <span className="font-mono text-xs text-kumo-default">{String(getValue() ?? '')}</span>
            )
          : undefined,
      })

    /** 数字列（右对齐、等宽数字）。 */
    const number = (key: keyof ComplexTableRow, format = money) =>
      columnHelper.accessor(key, {
        id: key,
        header: label(key),
        meta: {
          label: label(key),
          headerClassName: MIN_COLUMN_WIDTH,
          cellClassName: 'text-end',
        },
        cell: ({ getValue }) => (
          <span className="tabular-nums">{format(getValue())}</span>
        ),
      })

    /** 时间列（按全局时区格式化）。 */
    const time = (key: keyof ComplexTableRow) =>
      columnHelper.accessor(key, {
        id: key,
        header: label(key),
        meta: { label: label(key), headerClassName: 'min-w-[160px]' },
        cell: ({ getValue }) => (
          <span className="tabular-nums text-xs">{formatTimestamp(getValue())}</span>
        ),
      })

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
            aria-label={t('cell.selectRow', '选择 {{name}}', {
              name: row.original.customer_name,
            })}
          />
        ),
      }),

      // ── 订单与客户（7）
      text('id', { mono: true, minWidth: 'min-w-[150px]' }),
      text('customer_name', { minWidth: 'min-w-[170px]' }),
      text('customer_code', { mono: true }),
      text('contact_name'),
      text('contact_phone', { mono: true }),
      text('contact_email', { minWidth: 'min-w-[220px]' }),
      text('region'),

      // ── 商品（4）
      text('category'),
      text('product_name', { minWidth: 'min-w-[150px]' }),
      text('sku', { mono: true }),
      number('qty', (v) => String(v ?? 0)),

      // ── 金额（6）
      number('unit_price'),
      number('amount'),
      number('discount', (v) => `${v ?? 0}%`),
      number('tax'),
      number('total'),
      text('currency', { mono: true, minWidth: 'min-w-[90px]' }),

      // ── 履约（5）
      text('channel'),
      columnHelper.accessor('status', {
        id: 'status',
        header: label('status'),
        meta: { label: label('status'), headerClassName: MIN_COLUMN_WIDTH },
        cell: ({ getValue }) => {
          const value = getValue() as OrderStatus
          return (
            <Badge variant={ORDER_STATUS_VARIANT[value] ?? 'secondary'} appearance="dot">
              {t(`status.${value}`, value)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('pay_status', {
        id: 'pay_status',
        header: label('pay_status'),
        meta: { label: label('pay_status'), headerClassName: MIN_COLUMN_WIDTH },
        cell: ({ getValue }) => {
          const value = getValue() as PayStatus
          return (
            <Badge variant={PAY_STATUS_VARIANT[value] ?? 'secondary'} appearance="dot">
              {t(`payStatus.${value}`, value)}
            </Badge>
          )
        },
      }),
      text('pay_method'),
      text('owner'),

      // ── 时间与备注（3）
      time('order_time'),
      time('delivery_time'),
      text('remark', { minWidth: 'min-w-[180px]' }),
    ])
  }, [t, formatDateTime])
}
