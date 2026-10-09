import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DataTable,
  treeTableFeatures,
  useTable,
  useTreeSearchExpanded,
} from '#/components/data-table'
import type { ColumnVisibilityState } from '#/components/data-table'
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { useFeature } from '#/features/ai/page'
import { countTreeNodes, filterTreeByMatch } from '#/lib/tree-search'
import { useTreeTableColumns } from './columns'
import {
  summarizeTreeTable,
  TREE_TABLE_ROWS,
  TREE_TABLE_ROW_ID,
  TREE_TABLE_SUB_ROWS,
} from './data'
import { createTreeTableFeature } from './feature'

/**
 * 树形表格示例（`/$appId/example/tree-table`）。
 *
 * 这一页只演示**层级**：
 * - **父子行**：`treeTableFeatures` + `getSubRows`，展开控件由 `DataTable` 落在第一列；
 * - **搜索联动展开**：`useTreeSearchExpanded` —— 默认折叠 → 搜索时展开命中分支 →
 *   清空关键词回落折叠（通用逻辑，不要手写）；
 * - **子行强调**：子行换背景并在第一列左侧画一条 primary 竖线（`DataTable` 内置）。
 *
 * 搜索与过滤全部走 `#/lib/tree-search` 的通用能力；分组表头是另一页
 * （`example/complex-table`）的事 —— 两类能力都要占第一列，混在一起互相牵制。
 */
export function TreeTableExamplePage() {
  const { t } = useTranslation('example', { keyPrefix: 'tree-table' })

  const [keyword, setKeyword] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useTreeTableColumns()

  /**
   * 本地过滤：**只保留命中节点 + 其祖先链**（与树表展开语义配套）。
   * 路径用 `#/lib/tree-search` 的通用实现，不要在这里手写递归。
   */
  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return TREE_TABLE_ROWS
    return filterTreeByMatch(
      TREE_TABLE_ROWS,
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.owner.toLowerCase().includes(q),
      {
        getSubRows: TREE_TABLE_SUB_ROWS,
        withChildren: (row, children) => ({ ...row, children }),
      },
    )
  }, [keyword])

  const totals = useMemo(() => summarizeTreeTable(filteredRows), [filteredRows])

  /** 展开态：默认折叠 → 搜索时展开命中分支 → 清空关键词回落折叠。 */
  const treeSearch = useTreeSearchExpanded({
    filteredNodes: filteredRows,
    keyword,
    getSubRows: TREE_TABLE_SUB_ROWS,
    getRowId: TREE_TABLE_ROW_ID,
  })

  useFeature(
    createTreeTableFeature({
      rows: filteredRows,
      keyword,
      expandedIds: Object.keys(treeSearch.expanded),
    }),
  )

  const table = useTable({
    // 树表必须用 treeTableFeatures（它注册了 expandedRowModel）—— 不要用 stockFeatures
    features: treeTableFeatures,
    data: filteredRows,
    columns,
    state: { columnVisibility, expanded: treeSearch.expanded },
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: treeSearch.onExpandedChange,
    // 行 id 用业务主键（展开态在过滤 / 刷新后稳定）；访问器与过滤共用同一份
    getRowId: TREE_TABLE_ROW_ID,
    getSubRows: TREE_TABLE_SUB_ROWS,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '树形表格')}
        description={t(
          'description',
          '父子行、展开折叠与搜索联动展开的能力示例（数据为前端构造）',
        )}
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索分类 / 商品 / 负责人…'),
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
        // 层级缩进与展开控件固定落在第一个可见数据列（名称列），不需要指定列 id
        tree
        moduleName={t('moduleName', '树形表格')}
        // 统计含所有层级（与展开后的行数一致），随搜索变化
        quotaText={t('quota', '共 {{count}} 个节点', {
          count: countTreeNodes(filteredRows, TREE_TABLE_SUB_ROWS),
        })}
        emptyTitle={t('empty.title', '暂无数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的数据，请尝试更换关键词',
        )}
        footer={
          <span>
            {t('summary', '顶层分类 {{roots}} 个 / 合计商品数 {{count}} / 合计金额 {{amount}}', {
              roots: totals.roots,
              count: totals.count,
              amount: totals.amount.toLocaleString(),
            })}
          </span>
        }
      />
    </div>
  )
}
