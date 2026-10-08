import { Button, DropdownMenu, LayerDialog, Table } from '@cloudflare/kumo'
import { DotsThree, Eye, PencilSimple, Trash, UserIcon, UsersIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteUserById, getUser, postUserBatchDelete, UserItemSchema } from '#/api'
import type { GetUserData, UserItem } from '#/api'
import { USER_FILTER_FIELDS } from '#/api'
import { useFeature } from '#/features/ai/page'
import {
  createTableExampleListFeature,
  TABLE_EXAMPLE_SORTABLE_FIELDS as SORTABLE_FIELDS,
} from './feature'
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
import { DEFAULT_HIDDEN_COLUMNS, MIN_COLUMN_WIDTH, TABLE_EXAMPLE_COLUMN_SPECS } from './columns'
import { useAppTableState, usePreferencesStore } from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useDetailPreview } from '#/components/detail-preview'
import { PageHeader } from '#/components/page-header'
import { FilterBuilder, TableControls, describeFilterCondition } from '#/components/table-controls'
import type { FilterCondition, ResolveFilterFieldOptions } from '#/components/table-controls'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import type { DictOptionEntry } from '#/lib/dict-options'
import i18n from '#/lib/i18n'
import { defineFilterParsers, useTableQuery } from '#/lib/list-query'
import { useHasPermission } from '#/lib/permissions'
import { appToastManager } from '#/lib/toast'
import { DEMO_TABLE_EXAMPLE_ROWS } from './demo-data'
import { useFormatTimestamp } from './display'
import { TableExampleDetailView } from './detail-view'
import { TableExampleFormDialog } from './form-dialog'
import { getTableExampleFormMetadata, TableExampleFormView } from './form-view'

/**
 * 示例 / 表格示例（/$appId/example/table）
 *
 * 列编排约定：一列只呈现一项数据 ——
 * 标量字段独占一列；嵌套对象把内部字段展开成各自的列。
 */
const columnHelper = createColumnHelper<StockFeatures, UserItem>()

/**
 * 严格类型安全定义筛选解析器：
 * - 排除 primary 参数（kw/field/order 等）与分页参数（page/page_size）；
 * - 字段名和 Parser 类型必须与 OpenAPI 生成的 GetUserData['query'] 契约严格对应！
 */
const TABLE_EXAMPLE_FILTER_PARSERS = defineFilterParsers<GetUserData['query']>()({
  id: parseAsInteger,
  nickname: parseAsString,
  email: parseAsString,
  createtime_min: parseAsInteger,
  createtime_max: parseAsInteger,
  logintime_min: parseAsInteger,
  logintime_max: parseAsInteger,
})

export function TableExampleListPage() {
  const { t } = useTranslation('table-example')
  const navigate = useNavigate()
  const { open: openPreview } = useDetailPreview()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const formatTimestamp = useFormatTimestamp()

  const formOpenMode = usePreferencesStore((s) => s.formOpenMode)
  const isMobile = useIsMobileViewport()

  const canCreate = useHasPermission('table-example:create')
  const canEdit = useHasPermission('table-example:edit')
  const canDelete = useHasPermission('table-example:delete')

  // 1. 使用通用 useTableQuery 托管查询驱动状态（URL State，nuqs 驱动 + 类型严格推导）
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

  // 2. 表单打开状态同步存储到 URL（支持分享、刷新复现，以及由 AI 直接唤起）
  const [formState, setFormState] = useQueryStates(
    {
      form: parseAsStringLiteral(['create', 'edit'] as const),
      formId: parseAsInteger,
    },
    {
      history: 'replace',
      shallow: false,
      clearOnDefault: true,
    },
  )

  // 表单预填数据（供 AI open_form 传入初始值时预填到表单）
  const [formInitialData, setFormInitialData] = useState<UserItem | null>(null)

  // 筛选弹窗草稿状态
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState<FilterCondition[]>([])
  const [focusConditionId, setFocusConditionId] = useState<string | null>(null)

  // 3. 本机视觉偏好留在 Zustand 持久化（按应用隔离）
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'example/table',
    'columnVisibility',
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // 数据列表状态
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const hasDataRef = useRef(false)

  // 删除弹窗状态
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null)
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false)

  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false)

  /** 字典筛选适配 */
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

  // 执行 API 数据获取（直接消费类型安全的 queryParams）
  const fetchRows = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await getUser({
        query: queryParams,
      })

      const dataObj = res.data?.result
      const items = (dataObj?.items as UserItem[]) ?? []
      const totalCount = dataObj?.total ?? items.length

      if (res.response && !res.response.ok && items.length === 0) {
        setErrorMsg(
          res.data?.message ||
            i18n.t('table-example:messages.fetchFailed', { defaultValue: '获取表格示例失败' }),
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
          : i18n.t('table-example:messages.networkFailed', { defaultValue: '网络请求失败' })
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

  const openFormSplit = useCallback(
    (mode: 'create' | 'edit', id?: number | null, initialData?: UserItem | null) => {
      const isEdit = mode === 'edit'
      const meta = getTableExampleFormMetadata(mode, t)
      openPreview({
        key: isEdit ? `form-edit-${id}` : 'form-create',
        title: meta.title,
        description: isEdit && id ? `${meta.description} (ID ${id})` : meta.description,
        mode: 'split',
        onExpand: () => {
          // 分开写两个分支：`to` 用三元表达式时 TanStack 无法把 `params` 收窄到对应路由
          if (isEdit) {
            void navigate({
              to: '/$appId/example/table/$id/edit',
              params: { appId, id: String(id) },
            })
            return
          }
          void navigate({ to: '/$appId/example/table/new', params: { appId } })
        },
        onClose: () => {
          void setFormState({ form: null, formId: null })
          setFormInitialData(null)
        },
        render: ({ close }) => (
          <TableExampleFormView
            variant="split"
            mode={mode}
            userId={id}
            initialData={initialData ?? formInitialData}
            onSuccess={() => {
              close()
              void setFormState({ form: null, formId: null })
              setFormInitialData(null)
              void fetchRows()
            }}
            onClose={() => {
              close()
              void setFormState({ form: null, formId: null })
              setFormInitialData(null)
            }}
          />
        ),
      })
    },
    [appId, navigate, openPreview, fetchRows, setFormState, formInitialData, t],
  )

  // 打开新建表单（根据 formOpenMode 偏好自动分流到独立路由、分屏或弹窗）
  const handleOpenCreateForm = useCallback(
    (initialValues?: Partial<UserItem> | null) => {
      const initData = initialValues
        ? ({ id: 0, nickname: '', ...initialValues } as UserItem)
        : null
      setFormInitialData(initData)
      if (formOpenMode === 'page' || isMobile) {
        void navigate({ to: '/$appId/example/table/new', params: { appId } })
      } else {
        void setFormState({ form: 'create', formId: null })
        if (formOpenMode === 'split') {
          openFormSplit('create', null, initData)
        }
      }
    },
    [formOpenMode, isMobile, navigate, appId, setFormState, openFormSplit],
  )

  // 打开编辑表单（根据 formOpenMode 偏好自动分流）
  const handleOpenEditForm = useCallback(
    (user: UserItem, initialValues?: Partial<UserItem> | null) => {
      const mergedUser = initialValues ? { ...user, ...initialValues } : user
      setFormInitialData(mergedUser)
      if (formOpenMode === 'page' || isMobile) {
        void navigate({
          to: '/$appId/example/table/$id/edit',
          params: { appId, id: String(user.id) },
        })
      } else {
        void setFormState({ form: 'edit', formId: user.id })
        if (formOpenMode === 'split') {
          openFormSplit('edit', user.id, mergedUser)
        }
      }
    },
    [formOpenMode, isMobile, navigate, appId, setFormState, openFormSplit],
  )

  // 当处于 split 偏好且 URL 带有 form 状态时，在右侧分屏内展开 TableExampleFormView
  useEffect(() => {
    if (formOpenMode === 'split' && formState.form) {
      openFormSplit(formState.form, formState.formId)
    }
  }, [formState.form, formState.formId, formOpenMode, openFormSplit])

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
  }

  const handleClearFilters = () => {
    setFilterDraft([])
    tableFilters.onClearFilters()
    setFiltersOpen(false)
  }

  /*
    删除：**一段实现、两个入口** —— 页面上的确认弹窗，以及 AI 的页面指令
    （`delete-record` / `batch-delete-records`，见 ./feature.ts）。
    两边共用这里的逻辑，于是 toast、刷新表格、清空选中、关弹窗这些副作用
    不会因为"AI 走的是另一条路"而漏掉 —— 早期让 AI 直接调写接口，结果就是
    「接口删掉了、表格还显示着那条」。
  */
  const deleteOne = useCallback(
    async (id: number) => {
      const res = await deleteUserById({ path: { id } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '删除记录失败')
      }
      appToastManager.add({
        title: t('messages.deleteSuccess', '删除记录成功'),
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
      const res = await postUserBatchDelete({ body: { ids } })
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

  const openRecordDetail = useCallback(
    (user: UserItem) => {
      if (user.id === undefined || user.id === null) return
      const id = String(user.id)

      // 查看详情时，若此前处于表单打开状态，清理表单 URL 状态，解除两者的面板互斥
      if (formState.form) {
        void setFormState({ form: null, formId: null })
      }

      openPreview({
        key: id,
        title: user.nickname || t('cell.unnamed', '未设置昵称'),
        description: `${t('detail.fields.id', 'ID')} ${id}`,
        onExpand: () => {
          void navigate({
            to: '/$appId/example/table/$id',
            params: { appId, id },
          })
        },
        render: () => <TableExampleDetailView id={id} variant="preview" />,
      })
    },
    [appId, formState.form, navigate, openPreview, setFormState, t],
  )

  const columnRenderers = useMemo<Record<string, ColumnRenderer<UserItem>>>(
    () => ({
      userName: ({ row }) => (
        <button
          type="button"
          onClick={() => openRecordDetail(row)}
          className="max-w-48 truncate text-start font-medium text-kumo-default hover:underline"
        >
          {row.nickname || t('cell.unnamed', '未设置昵称')}
        </button>
      ),
    }),
    [openRecordDetail, t],
  )

  const schemaColumns = useSchemaColumns<UserItem>(UserItemSchema, {
    ns: 'table-example',
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
              aria-label={t('cell.selectAll', '全选当前页')}
            />
          ),
          cell: ({ row }) => (
            <Table.CheckCell
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(!!checked)}
              aria-label={t('cell.selectRow', '选择 {{name}}', {
                name: row.original.nickname || row.original.id,
              })}
            />
          ),
        }),

        columnHelper.display({
          id: 'avatar',
          header: t('columns.avatar', '头像'),
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
                onClick={() => openRecordDetail(user)}
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
                  <DropdownMenu.Item icon={Eye} onClick={() => openRecordDetail(user)}>
                    {t('rowActions.view', '查看')}
                  </DropdownMenu.Item>
                  {canEdit ? (
                    <DropdownMenu.Item icon={PencilSimple} onClick={() => handleOpenEditForm(user)}>
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
    [openRecordDetail, schemaColumns, handleOpenEditForm, canEdit, canDelete, t],
  )

  /*
    这一页对 AI 暴露的全部能力，**只在这一处登记**（原先散在四处：
    usePageCapabilities / useAiFormOpener / useAiPageReload / 无）。
    见 ./feature.ts 与 .agents/docs/features-architecture.md。
  */
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
      openCreateForm: handleOpenCreateForm,
      /*
        AI 手里只有 id（它是从 `get_page_data` 的列表里挑的），而页面这套编辑入口
        需要一个 `UserItem` 来承载"回显 + 预填" —— 这里按 id 拼一个最小壳，
        真正的预填值仍由 `initialValues` 合并进去（与表格行菜单那条路径共用同一段逻辑）。
      */
      openEditForm: (id, initialValues) =>
        handleOpenEditForm({ id, nickname: '' } as UserItem, initialValues),
      /*
        「看某个记录的详情」：AI 给的 id 必须落在**这一屏已加载的行**里才点得开
        （详情预览是行数据驱动的）；不在这一屏就明确报错，让它改用 navigate_to
        或先把筛选调过来 —— 而不是静默打开一个空壳。
      */
      openDetail: (id) => {
        const target = rows.find((item) => Number(item.id) === id)
        if (!target) {
          throw new Error(
            `这一屏里没有 id=${id} 的记录。请先用 get_page_data 确认，或改用 navigate_to 打开详情页。`,
          )
        }
        openRecordDetail(target)
      },
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

  const selectedRowsCount = table.getSelectedRowModel().rows.length

  const handleExportCSV = () => {
    const selectedRows = table.getSelectedRowModel().rows
    const listToExport = selectedRows.length > 0 ? selectedRows.map((r) => r.original) : rows

    if (listToExport.length === 0) return

    const headers = [
      t('export.headers.id', 'ID'),
      t('export.headers.nickname', '昵称'),
      t('export.headers.email', '邮箱'),
      t('export.headers.createtime', '注册时间'),
      t('export.headers.logintime', '最后登录'),
    ]

    /*
      本地变量不能叫 `rows`：上面 `listToExport` 还要读组件的 `rows`（列表数据），
      同名 `const` 会让那一行落进暂时性死区（未选中任何行时导出直接抛错）。
    */
    const csvRows = listToExport.map((u) => [
      u.id ?? '',
      `"${(u.nickname ?? '').replace(/"/g, '""')}"`,
      `"${u.email ?? ''}"`,
      formatTimestamp(u.createtime),
      formatTimestamp(u.logintime),
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `users_export_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '表格示例')}
        description={t('description', '查看、筛选与管理平台记录的基础信息')}
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
          onAddRecord: canCreate ? handleOpenCreateForm : undefined,
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
        onRowClick={openRecordDetail}
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

      {/* 弹窗形态打开的统一表单（由 formOpenMode === 'dialog' 激活） */}
      <TableExampleFormDialog
        open={formOpenMode === 'dialog' && !!formState.form}
        onOpenChange={(open) => {
          if (!open) {
            void setFormState({ form: null, formId: null })
            setFormInitialData(null)
          }
        }}
        mode={formState.form === 'edit' ? 'edit' : 'create'}
        userId={formState.formId}
        initialData={formInitialData}
        onSuccess={() => {
          void setFormState({ form: null, formId: null })
          setFormInitialData(null)
          void fetchRows()
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
    </div>
  )
}
