import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, treeTableFeatures, useTable } from '#/components/data-table'
import type {
  ColumnVisibilityState,
  ExpandedState,
  RowSelectionState,
} from '#/components/data-table'
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { useFeature } from '#/features/ai/page'
import { filterTreeByMatch } from '#/lib/tree-search'
import { useComplexTableColumns } from './columns'
import {
  COMPLEX_TABLE_ROWS,
  COMPLEX_TABLE_ROW_ID,
  COMPLEX_TABLE_SUB_ROWS,
  summarizeComplexTable,
} from './data'
import { createComplexTableFeature } from './feature'

/**
 * 复杂表格示例（`/$appId/example/complex-table`）。
 *
 * 这一页把 `DataTable` 的几项进阶能力集中演示一遍：
 * - **分组表头**：TanStack Table 的 group 列，`DataTable` 按 `getHeaderGroups()` 多行渲染；
 * - **可展开行**：`treeTableFeatures` + `getSubRows`，展开控件由 `DataTable` 落在第一列；
 * - **列显隐**：`TableControls` 的「显示选项」直接接管 TanStack 的列可见性；
 * - **行选择**：多选列 + 受控 `rowSelection`；
 * - **汇总行**：`footer` 渲染跨行的数量 / 金额合计。
 *
 * 数据是前端本地构造的（`./data`）—— 示例页不新增接口，避免为了演示能力多养一份契约。
 */
export function ComplexTablePage() {
  const { t } = useTranslation('complex-table')

  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useComplexTableColumns()

  /** 本地过滤：只保留命中节点 + 其祖先链（与树表展开语义配套）。 */
  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return COMPLEX_TABLE_ROWS
    return filterTreeByMatch(
      COMPLEX_TABLE_ROWS,
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q),
      {
        getSubRows: COMPLEX_TABLE_SUB_ROWS,
        withChildren: (row, children) => ({ ...row, children }),
      },
    )
  }, [keyword])

  const totals = useMemo(() => summarizeComplexTable(filteredRows), [filteredRows])

  /*
    `ExpandedState` 是 `true | Record<string, boolean>`：`true` 表示"全部展开"，
    本页只会写入对象（见 `expandAll`），所以这里按两种形态各自取 id，避免用 string 索引联合类型。
  */
  const expandedIds = useMemo(
    () =>
      expanded === true
        ? COMPLEX_TABLE_ROWS.map((row) => row.id)
        : Object.keys(expanded).filter((id) => expanded[id]),
    [expanded],
  )
  const selectedIds = useMemo(() => Object.keys(rowSelection), [rowSelection])

  const expandAll = useCallback(() => {
    setExpanded(
      Object.fromEntries(
        COMPLEX_TABLE_ROWS.filter((row) => (row.children?.length ?? 0) > 0).map((row) => [
          row.id,
          true,
        ]),
      ),
    )
  }, [])

  const collapseAll = useCallback(() => setExpanded({}), [])
  const clearSelection = useCallback(() => setRowSelection({}), [])

  useFeature(
    createComplexTableFeature({
      rows: filteredRows,
      keyword,
      selectedIds,
      expandedIds,
      expandAll,
      collapseAll,
      clearSelection,
    }),
  )

  const table = useTable({
    features: treeTableFeatures,
    data: filteredRows,
    columns,
    state: { expanded, rowSelection, columnVisibility },
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    // 行 id / 子节点访问器与过滤、展开共用同一份模块级常量（引用稳定）
    getRowId: COMPLEX_TABLE_ROW_ID,
    getSubRows: COMPLEX_TABLE_SUB_ROWS,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '复杂表格')}
        description={t(
          'description',
          '分组表头、可展开行、列显隐、行选择与汇总行的能力示例（数据为前端构造）',
        )}
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索订单号 / 名称 / 分类…'),
          ariaLabel: t('table.search.ariaLabel', {
            ns: 'common',
            defaultValue: '搜索',
          }),
          value: keyword,
          onChange: setKeyword,
          onSearch: setKeyword,
          onClear: () => setKeyword(''),
        }}
        table={table}
      />

      <DataTable
        table={table}
        moduleName={t('moduleName', '复杂表格')}
        tree
        emptyTitle={t('empty.title', '暂无数据')}
        emptyDescription={t('empty.description', '未找到符合条件的数据，请尝试更换关键词')}
        footer={
          <span>
            {t('summary', '共 {{orders}} 个订单 / 合计数量 {{qty}} / 合计金额 {{amount}}', {
              orders: totals.orders,
              qty: totals.qty,
              amount: totals.amount.toLocaleString(),
            })}
          </span>
        }
      />
    </div>
  )
}
