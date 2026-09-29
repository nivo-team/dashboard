import { Button, DropdownMenu, LayerDialog, Table } from '@cloudflare/kumo'
import {
  DotsThree,
  Eye,
  PencilSimple,
  Trash,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { parseAsInteger, parseAsString } from 'nuqs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteUserById,
  getUser,
  postUserBatchDelete,
  UserItemSchema,
} from '#/api'
import type { GetUserData, UserItem } from '#/api'
import { USER_FILTER_FIELDS } from '#/api/query-params.gen'
import { useAiPageContext } from '#/lib/ai'
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
  SchemaColumnSpec,
  StockFeatures,
} from '#/components/data-table'
import { useAppTableState } from '#/lib/store'
import { useDetailPreview } from '#/components/detail-preview'
import { PageHeader } from '#/components/page-header'
import {
  FilterBuilder,
  TableControls,
  describeFilterCondition,
} from '#/components/table-controls'
import type { FilterCondition, ResolveFilterFieldOptions } from '#/components/table-controls'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import type { DictOptionEntry } from '#/lib/dict-options'
import i18n from '#/lib/i18n'
import { defineFilterParsers, useTableQuery } from '#/lib/list-query'
import { appToastManager } from '#/lib/toast'
import { DEMO_USERS } from './-data/demo-users'
import { useFormatTimestamp } from './-data/user-display'
import { UserDetailView } from './-components/user-detail-view'
import { UserFormDialog } from './-components/user-form-dialog'

/**
 * 用户运营 / 用户列表（/$appId/users/user）
 *
 * 列编排约定：一列只呈现一项数据 ——
 * 标量字段独占一列；嵌套对象把内部字段展开成各自的列。
 */
export const Route = createFileRoute('/$appId/users/user/')({
  component: UserListPage,
})

/** 数据列统一最小宽度：宽表下避免列被挤压成折行。 */
const MIN_COLUMN_WIDTH = 'min-w-[120px]'

/** 默认隐藏的列：默认不隐藏 */
const DEFAULT_HIDDEN_COLUMNS = [] as const

/** 可排序列：列 id 与后端 field 参数一致，排序时直接复用。 */
const SORTABLE_FIELDS = [
  'nickname',
  'id',
  'createtime',
  'logintime',
] as const

/**
 * 列编排（顺序即白名单，一列一项数据）：
 * - 文案统一取 `users:columns.<字段名>`，新增字段只需补 i18n。
 */
const USER_COLUMN_SPECS: SchemaColumnSpec<UserItem>[] = [
  { field: 'nickname', render: 'userName' },
  { field: 'id', render: 'code' },
  { field: 'email', render: 'code' },
  { field: 'createtime' },
  { field: 'logintime' },
]

const columnHelper = createColumnHelper<StockFeatures, UserItem>()

/**
 * 严格类型安全定义筛选解析器：
 * - 排除 primary 参数（kw/field/order 等）与分页参数（page/page_size）；
 * - 字段名和 Parser 类型必须与 OpenAPI 生成的 GetUserData['query'] 契约严格对应！
 */
const USER_FILTER_PARSERS = defineFilterParsers<GetUserData['query']>()({
  id: parseAsInteger,
  nickname: parseAsString,
  email: parseAsString,
  createtime_min: parseAsInteger,
  createtime_max: parseAsInteger,
  logintime_min: parseAsInteger,
  logintime_max: parseAsInteger,
})

function UserListPage() {
  useAiPageContext(Route.id, {
    description: '用户列表：分页浏览用户，支持关键词搜索、多字段精确/范围筛选、排序、增删改查；点击行可打开详情。',
    entities: ['用户', '昵称', '邮箱', '注册时间'],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        purpose: '分页查询用户列表；支持 kw、多字段 filter 与排序',
      },
      {
        method: 'POST',
        path: '/user',
        purpose: '新建用户',
      },
      {
        method: 'PUT',
        path: '/user',
        purpose: '编辑更新用户',
      },
      {
        method: 'DELETE',
        path: '/user/{id}',
        purpose: '单项删除用户',
      },
      {
        method: 'POST',
        path: '/user/batch-delete',
        purpose: '批量删除用户',
      },
    ],
  })

  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const { open: openPreview } = useDetailPreview()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const formatTimestamp = useFormatTimestamp()

  // 1. 使用通用 useTableQuery 托管查询驱动状态（URL State，nuqs 驱动 + 类型严格推导）
  const {
    queryParams,
    pagination,
    search,
    sorting: tableSorting,
    filters: tableFilters,
  } = useTableQuery({
    filterParsers: USER_FILTER_PARSERS,
    fields: USER_FILTER_FIELDS,
    defaultPage: 1,
    defaultPageSize: 15,
    defaultSortField: 'createtime',
    defaultSortOrder: 'desc',
  })

  // 筛选弹窗草稿状态
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState<FilterCondition[]>([])
  const [focusConditionId, setFocusConditionId] = useState<string | null>(null)

  // 2. 本机视觉偏好留在 Zustand 持久化（按应用隔离）
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'users/user',
    'columnVisibility',
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // 数据列表状态
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const hasDataRef = useRef(false)

  // CRUD 弹窗状态
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [formDialogMode, setFormDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)

  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null)
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false)

  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false)

  /** 字典筛选适配 */
  const dictFilterEntries = useMemo<Record<string, readonly DictOptionEntry[]>>(
    () => ({}),
    [],
  )

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
  const fetchUsers = useCallback(async () => {
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
            i18n.t('users:messages.fetchFailed', { defaultValue: '获取用户列表失败' }),
        )
        if (res.response.status === 401 && !hasDataRef.current) {
          setIsDemoMode(true)
          setUsers(DEMO_USERS)
          setTotal(DEMO_USERS.length)
        }
      } else {
        hasDataRef.current = items.length > 0
        setUsers(items)
        setTotal(totalCount)
        setIsDemoMode(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : i18n.t('users:messages.networkFailed', { defaultValue: '网络请求失败' })
      setErrorMsg(msg)
      if (!hasDataRef.current) {
        setIsDemoMode(true)
        setUsers(DEMO_USERS)
        setTotal(DEMO_USERS.length)
      }
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

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

  const handleConfirmSingleDelete = async () => {
    if (!deletingUser?.id) return
    setSingleDeleteLoading(true)
    try {
      const res = await deleteUserById({
        path: { id: deletingUser.id },
      })
      if (res.data?.code === 0) {
        appToastManager.add({
          title: t('messages.deleteSuccess', '删除用户成功'),
          variant: 'success',
        })
        setSingleDeleteOpen(false)
        setDeletingUser(null)
        await fetchUsers()
      }
    } finally {
      setSingleDeleteLoading(false)
    }
  }

  const handleConfirmBatchDelete = async () => {
    const selectedRows = table.getSelectedRowModel().rows
    const ids = selectedRows
      .map((r) => r.original.id)
      .filter((id): id is number => typeof id === 'number')

    if (ids.length === 0) return

    setBatchDeleteLoading(true)
    try {
      const res = await postUserBatchDelete({
        body: { ids },
      })
      if (res.data?.code === 0) {
        appToastManager.add({
          title: t('messages.batchDeleteSuccess', '成功删除 {{count}} 个用户', {
            count: res.data.result?.deleted_count ?? ids.length,
          }),
          variant: 'success',
        })
        setBatchDeleteOpen(false)
        table.resetRowSelection()
        await fetchUsers()
      }
    } finally {
      setBatchDeleteLoading(false)
    }
  }

  const openUserDetail = useCallback(
    (user: UserItem) => {
      if (user.id === undefined || user.id === null) return
      const id = String(user.id)

      openPreview({
        key: id,
        title: user.nickname || t('cell.unnamed', '未设置昵称'),
        description: `${t('detail.fields.id', 'ID')} ${id}`,
        onExpand: () => {
          navigate({
            to: '/$appId/users/user/$id',
            params: { appId, id },
          })
        },
        render: () => <UserDetailView id={id} variant="preview" />,
      })
    },
    [appId, navigate, openPreview, t],
  )

  const columnRenderers = useMemo<Record<string, ColumnRenderer<UserItem>>>(
    () => ({
      userName: ({ row }) => (
        <button
          type="button"
          onClick={() => openUserDetail(row)}
          className="max-w-48 truncate text-start font-medium text-kumo-default hover:underline"
        >
          {row.nickname || t('cell.unnamed', '未设置昵称')}
        </button>
      ),
    }),
    [openUserDetail, t],
  )

  const schemaColumns = useSchemaColumns<UserItem>(UserItemSchema, {
    ns: 'users',
    columns: USER_COLUMN_SPECS,
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
              indeterminate={
                table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
              }
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
                onClick={() => openUserDetail(user)}
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
          header: () => (
            <span className="sr-only">{t('columns.actions', '操作')}</span>
          ),
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
                    onClick={() => openUserDetail(user)}
                  >
                    {t('rowActions.view', '查看')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    icon={PencilSimple}
                    onClick={() => {
                      setFormDialogMode('edit')
                      setEditingUser(user)
                      setFormDialogOpen(true)
                    }}
                  >
                    {t('rowActions.edit', '编辑')}
                  </DropdownMenu.Item>
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
                </DropdownMenu.Content>
              </DropdownMenu>
            )
          },
        }),
      ]),
    [openUserDetail, schemaColumns, t],
  )

  const table = useTable({
    features: stockFeatures,
    data: users,
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
    const listToExport = selectedRows.length > 0 ? selectedRows.map((r) => r.original) : users

    if (listToExport.length === 0) return

    const headers = [
      t('export.headers.id', 'ID'),
      t('export.headers.nickname', '昵称'),
      t('export.headers.email', '邮箱'),
      t('export.headers.createtime', '注册时间'),
      t('export.headers.logintime', '最后登录'),
    ]

    const rows = listToExport.map((u) => [
      u.id ?? '',
      `"${(u.nickname ?? '').replace(/"/g, '""')}"`,
      `"${u.email ?? ''}"`,
      formatTimestamp(u.createtime),
      formatTimestamp(u.logintime),
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
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
        title={t('title', '用户列表')}
        description={t('description', '查看、筛选与管理平台用户的基础信息')}
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
          onAddRecord: () => {
            setFormDialogMode('create')
            setEditingUser(null)
            setFormDialogOpen(true)
          },
          addRecordLabel: t('actions.create', '新建用户'),
          onExport: handleExportCSV,
          onRefresh: () => {
            void fetchUsers()
          },
          refreshLoading: loading,
        }}
      />

      <DataTable
        table={table}
        onRowClick={openUserDetail}
        onBatchDelete={() => setBatchDeleteOpen(true)}
        loading={loading}
        error={errorMsg}
        onRetry={fetchUsers}
        moduleName={t('moduleName', '用户')}
        extraStatus={
          isDemoMode ? (
            <span className="ms-2 font-medium text-amber-500">
              {t('demoBadge', '（演示数据模式）')}
            </span>
          ) : null
        }
        emptyTitle={t('empty.title', '暂无用户数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的用户，请尝试更换关键词或重置筛选条件',
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

      {/* 新增 / 编辑用户弹窗 */}
      <UserFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        mode={formDialogMode}
        initialData={editingUser}
        onSuccess={() => void fetchUsers()}
      />

      {/* 单项删除二次确认 */}
      <LayerDialog.Alert open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>{t('dialogs.deleteTitle', '删除用户')}</LayerDialog.Title>
          <LayerDialog.Description>
            {t(
              'dialogs.deleteConfirm',
              '确定要删除用户「{{name}}」吗？该操作不可撤销。',
              {
                name: deletingUser?.nickname || deletingUser?.id,
              },
            )}
          </LayerDialog.Description>
          <LayerDialog.Body />
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
          <LayerDialog.Title>{t('dialogs.batchDeleteTitle', '批量删除用户')}</LayerDialog.Title>
          <LayerDialog.Description>
            {t(
              'dialogs.batchDeleteConfirm',
              '确定要删除选中的 {{count}} 个用户吗？该操作不可撤销。',
              {
                count: selectedRowsCount,
              },
            )}
          </LayerDialog.Description>
          <LayerDialog.Body />
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
