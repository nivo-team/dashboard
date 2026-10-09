import { Badge } from '@cloudflare/kumo'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createColumnHelper } from '#/components/data-table'
import type { ColumnDef, StockFeatures } from '#/components/data-table'
import type { TreeTableRow } from './data'

/** 数据列统一最小宽度。 */
const MIN_COLUMN_WIDTH = 'min-w-[120px]'

const columnHelper = createColumnHelper<StockFeatures, TreeTableRow>()

/*
  状态 → 徽章变体。取值只用 Kumo 的合法集合
  （`primary | secondary | error | warning | success | info | outline | beta`）——
  不要写 `neutral` / `green` / `purple` 这类不在集合里的名字，它们会被静默忽略。
*/
const STATUS_VARIANT: Record<string, 'success' | 'primary' | 'secondary'> = {
  active: 'success',
  pending: 'primary',
  done: 'secondary',
}

/**
 * 「树形表格」示例的列编排 —— **单层表头**（不做分组）。
 *
 * 第一列（名称）承担层级缩进与展开控件，由 `DataTable` 在 `tree` 模式下自动接管，
 * 页面**不要**自己画缩进、也不需要指定「哪一列是树列」。
 * 因为缩进落在第一列，它的 `headerClassName` 要给够宽度，避免深层级把内容挤出去。
 */
export function useTreeTableColumns(): ColumnDef<StockFeatures, TreeTableRow>[] {
  const { t } = useTranslation('example', { keyPrefix: 'tree-table' })

  return useMemo(() => {
    const label = (key: string, fallback: string) => t(`columns.${key}`, fallback)

    return columnHelper.columns([
      // 树列必须排在最前：层级缩进与展开控件固定落在第一个可见数据列上
      columnHelper.accessor('name', {
        id: 'name',
        header: label('name', '分类 / 商品'),
        meta: { label: label('name', '分类 / 商品'), headerClassName: 'min-w-[220px]' },
      }),
      columnHelper.accessor('id', {
        id: 'id',
        header: label('id', '节点编号'),
        meta: { label: label('id', '节点编号'), headerClassName: 'min-w-[160px]' },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-kumo-default">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('owner', {
        id: 'owner',
        header: label('owner', '负责人'),
        meta: { label: label('owner', '负责人'), headerClassName: MIN_COLUMN_WIDTH },
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: label('status', '状态'),
        meta: { label: label('status', '状态'), headerClassName: MIN_COLUMN_WIDTH },
        cell: ({ getValue }) => {
          const value = String(getValue() ?? '')
          return (
            <Badge variant={STATUS_VARIANT[value] ?? 'secondary'} appearance="dot">
              {t(`status.${value}`, value)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('count', {
        id: 'count',
        header: label('count', '商品数'),
        meta: { label: label('count', '商品数'), headerClassName: MIN_COLUMN_WIDTH },
        cell: ({ getValue }) => (
          <span className="tabular-nums">{String(getValue() ?? 0)}</span>
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
    ])
  }, [t])
}
