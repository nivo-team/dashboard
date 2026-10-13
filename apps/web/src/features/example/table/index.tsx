import { Button, DropdownMenu, LayerDialog, Table } from '@cloudflare/kumo'
import { DotsThree, Eye, PencilSimple, Trash, UserIcon, UsersIcon } from '@phosphor-icons/react'
import { parseAsInteger, parseAsString } from 'nuqs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteExampleTableById,
  getExampleTable,
  postExampleTableBatchDelete,
  UserItemSchema,
} from '#/api'
import type { GetExampleTableData, UserItem } from '#/api'
import { USER_FILTER_FIELDS } from '#/api'
import {
  CrudViewport,
  useCrudView,
  type CrudFormSlotProps,
} from '#/components/crud'
import {
  DataTable,
  createColumnHelper,
  stockFeatures,
  useSchemaColumns,
  useTable,
} from '#/components/data-table'
import type {
  ColumnRenderer,
  ColumnVisibilityState,
  RowSelectionState,
  StockFeatures,
} from '#/components/data-table'
import { PageHeader } from '#/components/page-header'
import { FilterBuilder, TableControls, describeFilterCondition } from '#/components/table-controls'
import type { FilterCondition, ResolveFilterFieldOptions } from '#/components/table-controls'
import { useFeature } from '#/features/ai/page'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import type { DictOptionEntry } from '#/lib/dict-options'
import i18n from '#/lib/i18n'
import { defineFilterParsers, useTableQuery } from '#/lib/list-query'
import { useHasPermission } from '#/lib/permissions'
import { useAppTableState } from '#/lib/store'
import { appToastManager } from '#/lib/toast'
import { DEFAULT_HIDDEN_COLUMNS, MIN_COLUMN_WIDTH, TABLE_EXAMPLE_COLUMN_SPECS } from './columns'
import { tableExampleCreateFeature } from './create-feature'
import { DEMO_TABLE_EXAMPLE_ROWS } from './demo-data'
import { createTableExampleDetailFeature } from './detail-feature'
import { TableExampleDetailView } from './detail-view'
import { useFormatTimestamp } from './display'
import { tableExampleEditFeature } from './edit-feature'
import {
  createTableExampleListFeature,
  TABLE_EXAMPLE_SORTABLE_FIELDS as SORTABLE_FIELDS,
} from './feature'
import { getTableExampleFormMetadata, TableExampleFormView } from './form-view'

const columnHelper = createColumnHelper<StockFeatures, UserItem>()

const TABLE_EXAMPLE_FILTER_PARSERS = defineFilterParsers<GetExampleTableData['query']>()({
  id: parseAsInteger,
  nickname: parseAsString,
  email: parseAsString,
  createtime_min: parseAsInteger,
  createtime_max: parseAsInteger,
  logintime_min: parseAsInteger,
  logintime_max: parseAsInteger,
})

export function TableExampleListPage({ splat }: { splat?: string }) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const crud = useCrudView<UserItem>({
    basePath: `/${appId}/example/table`,
    splat,
    enableDetail: true,
    getFormMetadata: (mode: 'create' | 'edit', id?: string | number) => {
      const meta = getTableExampleFormMetadata(mode, t)
      return {
        title: meta.title,
        description: mode === 'edit' && id ? `${meta.description} (ID ${id})` : meta.description,
      }
    },
    getDetailMetadata: (id: string | number) => ({
      title: t('detail.title', '表格示例详情'),
      description: `${t('detail.fields.id', 'ID')} ${id}`,
    }),
  })

  const formatTimestamp = useFormatTimestamp()

  const canCreate = useHasPermission('example:create')
  const canEdit = useHasPermission('example:edit')
  const canDelete = useHasPermission('example:delete')

  const {
    queryParams,
    pagination,
    search,
    sorting: tableSorting,
    filters: tableFilters,
  } = useTableQuery({
    filterParsers: TABLE_EXAMPLE_FILTER_PARSERS,
    fields: USER_FILTER_FIELDS,
    defaultPage: 1,
    defaultPageSize: 15,
    defaultSortField: 'createtime',
    defaultSortOrder: 'desc',
  })

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState<FilterCondition[]>([])
  const [focusConditionId, setFocusConditionId] = useState<string | null>(null)

  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'example/table',
    'columnVisibility',
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const hasDataRef = useRef(false)

  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null)
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false)

  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false)

  const dictFilterEntries = useMemo<Record<string, readonly DictOptionEntry[]>>(() => ({}), [])

  const resolveFilterFieldOptions = useCallback<ResolveFilterFieldOptions>(
    (field) => {
      const entries = dictFilterEntries[field.param]
      if (!entries || entries.length === 0) return undefined
      return entries
        .filter((entry) => !entry.disabled)
        .map((entry) => ({ value: entry.value, label: entry.text }))
    },
    [dictFilterEntries],
  )

  const dictFilterOptionLabel = useCallback(
    (field: { param: string }, value: string) =>
      dictFilterEntries[field.param]?.find((entry) => entry.value === value)?.text,
    [dictFilterEntries],
  )

  const activeFilterItems = useMemo(
    () =>
      tableFilters.appliedFilters.map((condition) => ({
        id: condition.id,
        label: describeFilterCondition(
          condition,
          USER_FILTER_FIELDS.find((field) => field.param === condition.field),
          {
            yes: t('table.filterBuilder.yes', { ns: 'common', defaultValue: '是' }),
            no: t('table.filterBuilder.no', { ns: 'common', defaultValue: '否' }),
          },
          dictFilterOptionLabel,
        ),
      })),
    [tableFilters.appliedFilters, t, dictFilterOptionLabel],
  )

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await getExampleTable({
        query: queryParams,
      })

      const dataObj = res.data?.result
      const items = (dataObj?.items as UserItem[]) ?? []
      const totalCount = dataObj?.total ?? items.length

      if (res.response && !res.response.ok && items.length === 0) {
        setErrorMsg(
          res.data?.message ||
            i18n.t('example:table.messages.fetchFailed', { defaultValue: '获取表格示例失败' }),
        )
        if (res.response.status === 401 && !hasDataRef.current) {
          setIsDemoMode(true)
          setRows(DEMO_TABLE_EXAMPLE_ROWS)
          setTotal(DEMO_TABLE_EXAMPLE_ROWS.length)
        }
      } else {
        hasDataRef.current = items.length > 0
        setRows(items)
        setTotal(totalCount)
        setIsDemoMode(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : i18n.t('example:table.messages.networkFailed', { defaultValue: '网络请求失败' })
      setErrorMsg(msg)
      if (!hasDataRef.current) {
        setIsDemoMode(true)
        setRows(DEMO_TABLE_EXAMPLE_ROWS)
        setTotal(DEMO_TABLE_EXAMPLE_ROWS.length)
      }
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  const handleFiltersOpenChange = (open: boolean) => {
    setFiltersOpen(open)
    if (open) {
      setFilterDraft(tableFilters.appliedFilters)
    } else {
      setFocusConditionId(null)
    }
  }

  const handleApplyFilters = () => {
    tableFilters.onApplyFilters(filterDraft)
    setFiltersOpen(false)
    setFocusConditionId(null)
  }

  const handleClearFilters = () => {
    setFilterDraft([])
    tableFilters.onClearFilters()
    setFiltersOpen(false)
    setFocusConditionId(null)
  }

  const handleExportCSV = useCallback(() => {
    if (rows.length === 0) {
      appToastManager.add({
        title: t('messages.exportEmpty', '当前没有可导出的数据'),
        variant: 'info',
      })
      return
    }

    const headers = [
      t('columns.id', 'ID'),
      t('columns.nickname', '昵称'),
      t('columns.email', '邮箱'),
      t('columns.createtime', '创建时间'),
      t('columns.logintime', '最后登录'),
    ]

    const csvRows = rows.map((r) => [
      r.id ?? '',
      `"${(r.nickname || '').replace(/"/g, '""')}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      `"${formatTimestamp(r.createtime)}"`,
      `"${formatTimestamp(r.logintime)}"`,
    ])

    const csvContent =
      '﻿' + [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `table-example-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    appToastManager.add({
      title: t('messages.exportSuccess', '已导出 {{count}} 条记录', { count: rows.length }),
      variant: 'success',
    })
  }, [rows, t, formatTimestamp])

  const deleteOne = useCallback(
    async (id: number) => {
      const res = await deleteExampleTableById({ path: { id } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '删除记录失败')
      }
      appToastManager.add({
        title: t('messages.deleteSuccess', '记录已删除'),
        variant: 'success',
      })
      setSingleDeleteOpen(false)
      setDeletingUser(null)
      await fetchRows()
      return { id }
    },
    [fetchRows, t],
  )

  const deleteMany = useCallback(
    async (ids: number[]) => {
      const res = await postExampleTableBatchDelete({ body: { ids } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '批量删除记录失败')
      }
      appToastManager.add({
        title: t('messages.batchDeleteSuccess', '成功删除 {{count}} 个记录', {
          count: res.data.result?.deleted_count ?? ids.length,
        }),
        variant: 'success',
      })
      setBatchDeleteOpen(false)
      setRowSelection({})
      await fetchRows()
      return { ids, deleted: res.data.result?.deleted_count ?? ids.length }
    },
    [fetchRows, t],
  )

  const handleConfirmSingleDelete = async () => {
    if (!deletingUser?.id) return
    setSingleDeleteLoading(true)
    try {
      await deleteOne(deletingUser.id)
    } finally {
      setSingleDeleteLoading(false)
    }
  }

  const handleConfirmBatchDelete = async () => {
    const ids = Object.keys(rowSelection)
      .map((key) => Number(key))
      .filter((id) => Number.isFinite(id))

    if (ids.length === 0) return

    setBatchDeleteLoading(true)
    try {
      await deleteMany(ids)
    } finally {
      setBatchDeleteLoading(false)
    }
  }

  const columnRenderers = useMemo<Record<string, ColumnRenderer<UserItem>>>(
    () => ({
      userName: ({ row }) => (
        <button
          type="button"
          onClick={() => row.id !== undefined && crud.openDetail(row.id)}
          className="max-w-48 truncate text-start font-medium text-kumo-default hover:underline"
        >
          {row.nickname || t('cell.unnamed', '未设置昵称')}
        </button>
      ),
    }),
    [crud, t],
  )

  const schemaColumns = useSchemaColumns<UserItem>(UserItemSchema, {
    ns: 'example',
    keyPrefix: 'table',
    columns: TABLE_EXAMPLE_COLUMN_SPECS,
    sortable: SORTABLE_FIELDS,
    baseMeta: { headerClassName: MIN_COLUMN_WIDTH },
    renderers: columnRenderers,
  })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'select',
          enableHiding: false,
          header: ({ table }) => (
            <Table.CheckHead
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
              onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
              aria-label={t('columns.selectAll', '全选当前页')}
            />
          ),
          cell: ({ row }) => (
            <Table.CheckCell
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(!!checked)}
              aria-label={t('columns.selectRow', '选择此行')}
            />
          ),
          meta: {
            headerClassName: 'w-10',
            cellClassName: 'w-10',
          },
        }),

        columnHelper.display({
          id: 'avatar',
          header: () => <span className="sr-only">{t('columns.avatar', '头像')}</span>,
          enableSorting: false,
          enableHiding: false,
          meta: {
            label: t('columns.avatar', '头像'),
            headerClassName: 'w-14',
            cellClassName: 'w-14',
          },
          cell: ({ row }) => {
            const user = row.original
            return (
              <button
                type="button"
                onClick={() => user.id !== undefined && crud.openDetail(user.id)}
                aria-label={t('rowActions.view', '查看')}
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-kumo-elevated ring-1 ring-kumo-line"
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.nickname || t('cell.avatarAlt', '头像')}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <UserIcon size={16} className="text-kumo-subtle" />
                )}
              </button>
            )
          },
        }),

        ...schemaColumns,

        columnHelper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions', '操作')}</span>,
          enableHiding: false,
          meta: {
            sticky: 'right',
            cellClassName: 'text-end',
          },
          cell: ({ row }) => {
            const user = row.original
            return (
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      shape="square"
                      aria-label={t('rowActions.label', '更多操作')}
                    >
                      <DotsThree weight="bold" size={16} />
                    </Button>
                  }
                />
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item
                    icon={Eye}
                    onClick={() => user.id !== undefined && crud.openDetail(user.id)}
                  >
                    {t('rowActions.view', '查看')}
                  </DropdownMenu.Item>
                  {canEdit && user.id !== undefined ? (
                    <DropdownMenu.Item
                      icon={PencilSimple}
                      onClick={() => crud.openEdit(user.id, user)}
                    >
                      {t('rowActions.edit', '编辑')}
                    </DropdownMenu.Item>
                  ) : null}
                  {canDelete ? (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        icon={Trash}
                        variant="danger"
                        onClick={() => {
                          setDeletingUser(user)
                          setSingleDeleteOpen(true)
                        }}
                      >
                        {t('rowActions.delete', '删除')}
                      </DropdownMenu.Item>
                    </>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu>
            )
          },
        }),
      ]),
    [crud, schemaColumns, canEdit, canDelete, t],
  )

  useFeature(
    createTableExampleListFeature({
      rows,
      total,
      loading,
      demoMode: isDemoMode,
      queryState: { ...queryParams, filters: tableFilters.appliedFilters } as Record<
        string,
        unknown
      >,
      selectedIds: Object.keys(rowSelection)
        .map((key) => Number(key))
        .filter((id) => Number.isFinite(id)),
      deleteOne,
      deleteMany,
      openCreateForm: crud.openCreate,
      openEditForm: (id, initialValues) =>
        crud.openEdit(id, (initialValues ?? { id, nickname: '' }) as UserItem),
      openDetail: (id) => crud.openDetail(id),
      reload: fetchRows,
    }),
  )

  const table = useTable({
    features: stockFeatures,
    data: rows,
    columns,
    state: {
      sorting: tableSorting.sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: tableSorting.onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
  })

  const selectedRowsCount = Object.keys(rowSelection).length

  return (
    <div className="flex flex-col gap-4">
      <CrudViewport
        crud={crud}
        renderForm={(ctx) => (
          <TableExampleFormSlot
            ctx={ctx}
            onSuccess={() => {
              ctx.close()
              void fetchRows()
            }}
          />
        )}
        renderDetail={(ctx) => <TableExampleDetailSlot id={ctx.id} />}
      >
        <PageHeader
          title={t('title', '表格示例')}
          description={t(
            'description',
            '展示基于 TanStack Table 与通用列生成的后台数据表格，支持排序、筛选、列设置及导出。',
          )}
        />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索 ID / 昵称 / 邮箱…'),
          ariaLabel: t('table.search.ariaLabel', {
            ns: 'common',
            defaultValue: '搜索',
          }),
          value: search.value,
          onChange: search.onChange,
          onSearch: search.onSearch,
          onClear: search.onClear,
        }}
        filters={{
          open: filtersOpen,
          onOpenChange: handleFiltersOpenChange,
          activeCount: tableFilters.appliedFilters.length,
          children: (
            <FilterBuilder
              fields={USER_FILTER_FIELDS}
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
          onClearAll: tableFilters.onClearFilters,
        }}
        table={table}
        actions={{
          onAddRecord: canCreate ? () => crud.openCreate() : undefined,
          addRecordLabel: t('actions.create', '新建记录'),
          onExport: handleExportCSV,
          onRefresh: () => {
            void fetchRows()
          },
          refreshLoading: loading,
        }}
      />

      <DataTable
        table={table}
        onRowClick={(user) => user.id !== undefined && crud.openDetail(user.id)}
        onBatchDelete={canDelete ? () => setBatchDeleteOpen(true) : undefined}
        loading={loading}
        error={errorMsg}
        onRetry={fetchRows}
        moduleName={t('moduleName', '记录')}
        extraStatus={
          isDemoMode ? (
            <span className="ms-2 font-medium text-amber-500">
              {t('demoBadge', '（演示数据模式）')}
            </span>
          ) : null
        }
        emptyTitle={t('empty.title', '暂无记录数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的记录，请尝试更换关键词或重置筛选条件',
        )}
        emptyIcon={<UsersIcon size={44} className="text-kumo-inactive" />}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          onPageChange: pagination.onPageChange,
          onPageSizeChange: pagination.onPageSizeChange,
        }}
      />

      {/* 单项删除二次确认 */}
      <LayerDialog.Alert open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>{t('dialogs.deleteTitle', '删除记录')}</LayerDialog.Title>
          <LayerDialog.Description>
            {t('dialogs.deleteConfirm', '确定要删除记录「{{name}}」吗？该操作不可撤销。', {
              name: deletingUser?.nickname || deletingUser?.id,
            })}
          </LayerDialog.Description>
          <LayerDialog.Body>{null}</LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={handleConfirmSingleDelete}
              loading={singleDeleteLoading}
            >
              {t('dialogs.delete', '删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>

      {/* 批量删除二次确认 */}
      <LayerDialog.Alert open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>{t('dialogs.batchDeleteTitle', '批量删除记录')}</LayerDialog.Title>
          <LayerDialog.Description>
            {t(
              'dialogs.batchDeleteConfirm',
              '确定要删除选中的 {{count}} 个记录吗？该操作不可撤销。',
              {
                count: selectedRowsCount,
              },
            )}
          </LayerDialog.Description>
          <LayerDialog.Body>{null}</LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={handleConfirmBatchDelete}
              loading={batchDeleteLoading}
            >
              {t('dialogs.batchDelete', '批量删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </CrudViewport>
  </div>
  )
}

/** 统一表单插槽：内聚 AI Feature 挂载与业务表单交互 */
function TableExampleFormSlot({
  ctx,
  onSuccess,
}: {
  ctx: CrudFormSlotProps<UserItem>
  onSuccess: () => void
}) {
  useFeature(ctx.mode === 'create' ? tableExampleCreateFeature : tableExampleEditFeature)

  return (
    <TableExampleFormView
      formId={ctx.formId}
      mode={ctx.mode}
      userId={ctx.id}
      initialData={ctx.initialData}
      hideActions={ctx.hideActions}
      onSuccess={onSuccess}
      onClose={ctx.close}
    />
  )
}

/** 统一详情插槽：内聚详情 AI Feature 挂载与数据反馈 */
function TableExampleDetailSlot({ id }: { id: string | number }) {
  const [detailUser, setDetailUser] = useState<UserItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailDemo, setDetailDemo] = useState(false)

  useFeature(
    createTableExampleDetailFeature({
      user: detailUser,
      loading: detailLoading,
      demoMode: detailDemo,
      id: String(id),
    }),
  )

  return (
    <TableExampleDetailView
      id={String(id)}
      onData={(user, meta) => {
        setDetailUser(user)
        setDetailLoading(meta.loading)
        setDetailDemo(meta.demoMode)
      }}
    />
  )
}
