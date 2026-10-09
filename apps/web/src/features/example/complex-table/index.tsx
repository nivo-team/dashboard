import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, stockFeatures, useTable } from '#/components/data-table'
import type { ColumnVisibilityState, RowSelectionState } from '#/components/data-table'
import {
  FilterBuilder,
  TableControls,
  describeFilterCondition,
} from '#/components/table-controls'
import type { FilterCondition, ResolveFilterFieldOptions } from '#/components/table-controls'
import { PageHeader } from '#/components/page-header'
import { useFeature } from '#/features/ai/page'
import { useTableQuery } from '#/lib/list-query'
import { useComplexTableColumns } from './columns'
import { COMPLEX_TABLE_ROWS, COMPLEX_TABLE_ROW_ID, summarizeComplexTable } from './data'
import {
  COMPLEX_TABLE_FILTER_FIELDS,
  COMPLEX_TABLE_FILTER_PARSERS,
} from './filter-fields'
import { filterRows } from './filter-rows'
import { createComplexTableFeature } from './feature'

/**
 * 复杂表格示例（`/$appId/example/complex-table`）。
 *
 * 演示**宽表 + 全字段可筛选**：25 个字段、**单层表头**（不做分组表头 —— 那会多占
 * 一行表头，而宽表要的是「一行表头 + 横向滚动」），每个字段都能作为搜索条件。
 *
 * 筛选链路与真实接口页**完全一致**：
 *
 * ```
 * FilterBuilder（条件草稿）→ useTableQuery（写进 URL）→ filterRows（应用）
 * ```
 *
 * 区别只在最后一步：这一页的数据是前端本地构造的，所以由 `filterRows()` 在内存里筛；
 * 换真实后端时把它换成「把 `queryParams` 交给 query」即可，筛选器与 URL 状态一行都不用改。
 *
 * 列显隐、行选择、汇总行也都是 `DataTable` 的通用能力，页面不自己实现。
 */
export function ComplexTablePage() {
  const { t } = useTranslation('example', { keyPrefix: 'complex-table' })

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [filterDraft, setFilterDraft] = useState<FilterCondition[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [focusConditionId, setFocusConditionId] = useState<string | null>(null)

  const columns = useComplexTableColumns()

  /*
    查询驱动状态全部托管给 useTableQuery（URL state，nuqs 驱动）——
    筛选条件因此可分享、可刷新复现，AI 也能直接改 URL 来驱动页面。
  */
  const { pagination, search, filters: tableFilters, rawQuery } = useTableQuery({
    filterParsers: COMPLEX_TABLE_FILTER_PARSERS,
    fields: COMPLEX_TABLE_FILTER_FIELDS,
    defaultPage: 1,
    defaultPageSize: 15,
    defaultSortField: 'order_time',
    defaultSortOrder: 'desc',
  })

  /*
    数据管线：主搜索（kw，跨字段模糊）→ 逐字段筛选 → 排序。
    真实接口页由后端做这三件事，这里在前端等价实现（顺序保持一致）。
  */
  const filteredRows = useMemo(() => {
    const byKeyword = search.value.trim()
      ? (() => {
          const q = search.value.trim().toLowerCase()
          return COMPLEX_TABLE_ROWS.filter((row) =>
            Object.values(row).some((value) =>
              String(value ?? '').toLowerCase().includes(q),
            ),
          )
        })()
      : COMPLEX_TABLE_ROWS

    const byFilters = filterRows(byKeyword, rawQuery as Record<string, unknown>)

    // 排序：与真实页一样按 order_time 倒序（表头排序未开放，避免与筛选叠加时的认知负担）
    return [...byFilters].sort((a, b) => b.order_time - a.order_time)
  }, [search.value, rawQuery])

  /** 分页（受控，DataTable 只回调不切片）。 */
  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filteredRows.slice(start, start + pagination.pageSize)
  }, [filteredRows, pagination.page, pagination.pageSize])

  const totals = useMemo(() => summarizeComplexTable(filteredRows), [filteredRows])
  const selectedIds = useMemo(() => Object.keys(rowSelection), [rowSelection])
  const clearSelection = useCallback(() => setRowSelection({}), [])

  /**
   * 枚举字段的下拉候选文案：取 i18n 的 `enum.<字段>.<值>`，
   * 保证「区域」这类筛选 chip 显示的是「华东」而不是原始值。
   */
  const resolveFilterFieldOptions = useCallback<ResolveFilterFieldOptions>(
    (field) => {
      if (field.control !== 'enum' || !field.options) return undefined
      return field.options.map((value) => ({
        value,
        label: t(`enum.${field.name}.${value}`, value),
      }))
    },
    [t],
  )

  const activeFilterItems = useMemo(
    () =>
      tableFilters.appliedFilters.map((condition) => ({
        id: condition.id,
        label: describeFilterCondition(
          condition,
          COMPLEX_TABLE_FILTER_FIELDS.find((field) => field.param === condition.field),
          {
            yes: t('table.filterBuilder.yes', { ns: 'common', defaultValue: '是' }),
            no: t('table.filterBuilder.no', { ns: 'common', defaultValue: '否' }),
          },
          (field, value) => t(`enum.${field.name}.${value}`, value),
        ),
      })),
    [tableFilters.appliedFilters, t],
  )

  const handleFiltersOpenChange = (open: boolean) => {
    setFiltersOpen(open)
    if (open) {
      // 打开时把 URL 里已生效的条件灌进草稿，便于在已有条件上继续编辑
      setFilterDraft(tableFilters.appliedFilters)
    } else {
      setFocusConditionId(null)
    }
  }

  const handleApplyFilters = () => {
    tableFilters.onApplyFilters(filterDraft)
    pagination.onPageChange(1)
    setFiltersOpen(false)
  }

  const handleClearFilters = () => {
    setFilterDraft([])
    tableFilters.onClearFilters()
    setFocusConditionId(null)
  }

  useFeature(
    createComplexTableFeature({
      rows: filteredRows,
      keyword: search.value,
      selectedIds,
      clearSelection,
    }),
  )

  const table = useTable({
    // 配套要求：`features` 槽必须注册特性集（非树表用 stockFeatures）
    features: stockFeatures,
    data: pagedRows,
    columns,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: COMPLEX_TABLE_ROW_ID,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '复杂表格')}
        description={t(
          'description',
          '25 个字段的宽表示例，单层表头，每个字段都可作为筛选条件（数据为前端构造）',
        )}
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索任意字段…'),
          ariaLabel: t('table.search.ariaLabel', {
            ns: 'common',
            defaultValue: '搜索',
          }),
          value: search.value,
          onChange: search.onChange,
          onSearch: () => {
            search.onSearch()
            pagination.onPageChange(1)
          },
          onClear: () => {
            search.onClear()
            pagination.onPageChange(1)
          },
        }}
        filters={{
          open: filtersOpen,
          onOpenChange: handleFiltersOpenChange,
          activeCount: tableFilters.appliedFilters.length,
          children: (
            <FilterBuilder
              fields={COMPLEX_TABLE_FILTER_FIELDS}
              value={filterDraft}
              onChange={setFilterDraft}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              onClose={() => handleFiltersOpenChange(false)}
              focusConditionId={focusConditionId ?? undefined}
              resolveFieldOptions={resolveFilterFieldOptions}
            />
          ),
        }}
        activeFilters={{
          items: activeFilterItems,
          onEdit: (id) => {
            setFocusConditionId(id)
            setFiltersOpen(true)
          },
          onRemove: tableFilters.onRemoveFilter,
          onClearAll: handleClearFilters,
        }}
        table={table}
        actions={{
          onRefresh: () => {
            // 本地数据无需重新拉取，清掉筛选草稿即可回到初始视图
            setRowSelection({})
          },
          refreshLoading: false,
        }}
      />

      <DataTable
        table={table}
        moduleName={t('moduleName', '复杂表格')}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: filteredRows.length,
          onPageChange: pagination.onPageChange,
          onPageSizeChange: (size) => {
            pagination.onPageSizeChange(size)
            pagination.onPageChange(1)
          },
        }}
        emptyTitle={t('empty.title', '暂无数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的数据，请调整筛选条件或关键词',
        )}
        footer={
          <span>
            {t('summary', '共 {{orders}} 个订单 / 合计数量 {{qty}} / 合计金额 {{total}}', {
              orders: totals.orders,
              qty: totals.qty,
              total: totals.total.toLocaleString(),
            })}
          </span>
        }
      />
    </div>
  )
}
