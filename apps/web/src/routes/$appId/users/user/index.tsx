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
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
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
import {
  definePageCapabilities,
  useAiFormOpener,
  useAiPageReload,
  usePageCapabilities,
} from '#/lib/ai'
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
import { useAppTableState, usePreferencesStore } from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
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
import { getUserFormMetadata, UserFormView } from './-components/user-form-view'

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

/**
 * 页面能力声明（标准 JSON 规格）：
 * 向系统与 AI 声明当前页面的全套能力（查询、表单、批量动作、接口），
 * 底层统一经过 filterPageCapabilities 集中权限过滤（遵循铁律 4）。
 */
const USER_PAGE_CAPABILITIES = definePageCapabilities({
  routeId: Route.id,
  title: '用户列表与管理',
  description:
    '分页浏览用户，支持关键词搜索、多字段精确/范围筛选、排序、增删改查；点击行可打开详情，支持 AI 自动填表与新建。',
  entities: ['用户', '昵称', '邮箱', '注册时间'],
  forms: [
    {
      id: 'user-form-create',
      title: '新建用户',
      action: 'create',
      permission: 'user:create',
      description: '录入新用户的昵称、邮箱与头像',
      submission: {
        endpoint: { method: 'POST', path: '/user' },
        submitLabel: '创建用户',
        requireApproval: true,
        approvalReason: '将填好的新用户档案提交至服务端入库',
      },
      fields: [
        {
          name: 'nickname',
          label: '用户昵称',
          type: 'text',
          required: true,
          description: '必填，用户昵称',
        },
        {
          name: 'email',
          label: '邮箱地址',
          type: 'text',
          description: '选填，邮箱地址',
        },
        {
          name: 'avatar_url',
          label: '头像 URL',
          type: 'text',
          description: '选填，头像图片链接',
        },
      ],
    },
    {
      id: 'user-form-edit',
      title: '编辑用户',
      action: 'edit',
      permission: 'user:edit',
      description: '修改指定用户的资料信息',
      submission: {
        endpoint: { method: 'PUT', path: '/user' },
        submitLabel: '保存修改',
        requireApproval: true,
        approvalReason: '将修改后的用户资料保存至服务端',
      },
      fields: [
        {
          name: 'nickname',
          label: '用户昵称',
          type: 'text',
          required: true,
          description: '用户昵称',
        },
        {
          name: 'email',
          label: '邮箱地址',
          type: 'text',
          description: '邮箱地址',
        },
        {
          name: 'avatar_url',
          label: '头像 URL',
          type: 'text',
          description: '头像图片链接',
        },
      ],
    },
  ],
  actions: [
    {
      id: 'batch-delete',
      title: '批量删除用户',
      type: 'batch-delete',
      permission: 'user:delete',
      description: '多选勾选若干用户后，调用批量删除接口移除',
    },
    {
      id: 'single-delete',
      title: '单项删除用户',
      type: 'delete',
      permission: 'user:delete',
      description: '在行操作菜单中删除单个用户',
    },
    {
      id: 'export-csv',
      title: '导出用户数据',
      type: 'export',
      permission: 'user:export',
      description: '将勾选的或当前可见的用户列表导出为 CSV 文件',
    },
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/user',
      purpose: '分页查询用户列表；支持 kw、多字段 filter 与排序',
    },
    {
      method: 'POST',
      path: '/user',
      permission: 'user:create',
      purpose: '新建用户',
    },
    {
      method: 'PUT',
      path: '/user',
      permission: 'user:edit',
      purpose: '编辑更新用户',
    },
    {
      method: 'DELETE',
      path: '/user/{id}',
      permission: 'user:delete',
      purpose: '单项删除用户',
    },
    {
      method: 'POST',
      path: '/user/batch-delete',
      permission: 'user:delete',
      purpose: '批量删除用户',
    },
  ],
  searchParams: {
    description: '支持关键词模糊搜索、多字段精确/范围筛选、服务端排序与分页',
    keywordParam: 'kw',
    paginationParams: ['page', 'page_size'],
    sortableFields: SORTABLE_FIELDS,
    filterFields: USER_FILTER_FIELDS,
  },
})

function UserListPage() {
  usePageCapabilities(USER_PAGE_CAPABILITIES)

  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const { open: openPreview } = useDetailPreview()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const formatTimestamp = useFormatTimestamp()

  const formOpenMode = usePreferencesStore((s) => s.formOpenMode)
  const isMobile = useIsMobileViewport()

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

  // 删除弹窗状态
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

  /*
    把「重新取数」交给 AI 通道：这一页的数据**不走 react-query**（直接调 SDK 塞 state），
    所以 AI 通过 `call_write_api` 删掉一条后，只有页面自己重取一次，表格才会跟着变
    （否则用户看到的是"删了但还在"，与 AI 的回答矛盾）。
    登记的闭包每轮渲染都指向最新的 `fetchUsers`，因此筛选 / 分页 / 排序全部保留。
    见 `#/lib/ai/page-reload-bridge`。
  */
  useAiPageReload(fetchUsers)

  const openFormSplit = useCallback(
    (
      mode: 'create' | 'edit',
      id?: number | null,
      initialData?: UserItem | null,
    ) => {
      const isEdit = mode === 'edit'
      const meta = getUserFormMetadata(mode, t)
      openPreview({
        key: isEdit ? `form-edit-${id}` : 'form-create',
        title: meta.title,
        description:
          isEdit && id ? `${meta.description} (ID ${id})` : meta.description,
        mode: 'split',
        onExpand: () => {
          navigate({
            to: isEdit
              ? '/$appId/users/user/$id/edit'
              : '/$appId/users/user/new',
            params: isEdit
              ? { appId, id: String(id) }
              : { appId },
          })
        },
        onClose: () => {
          void setFormState({ form: null, formId: null })
          setFormInitialData(null)
        },
        render: ({ close }) => (
          <UserFormView
            variant="split"
            mode={mode}
            userId={id}
            initialData={initialData ?? formInitialData}
            onSuccess={() => {
              close()
              void setFormState({ form: null, formId: null })
              setFormInitialData(null)
              void fetchUsers()
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
    [appId, navigate, openPreview, fetchUsers, setFormState, formInitialData, t],
  )

  // 打开新建表单（根据 formOpenMode 偏好自动分流到独立路由、分屏或弹窗）
  const handleOpenCreateForm = useCallback(
    (initialValues?: Partial<UserItem> | null) => {
      const initData = initialValues
        ? ({ id: 0, nickname: '', ...initialValues } as UserItem)
        : null
      setFormInitialData(initData)
      if (formOpenMode === 'page' || isMobile) {
        navigate({ to: '/$appId/users/user/new', params: { appId } })
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
        navigate({
          to: '/$appId/users/user/$id/edit',
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

  // 注册让 AI 能够直接打开当前页面的新建或编辑表单（并支持携带预填字段）
  useAiFormOpener(
    useCallback(
      ({ action, id, initialValues }) => {
        if (action === 'create') {
          handleOpenCreateForm(initialValues as Partial<UserItem>)
        } else if (action === 'edit' && id) {
          handleOpenEditForm(
            { id: Number(id), nickname: '' },
            initialValues as Partial<UserItem>,
          )
        }
      },
      [handleOpenCreateForm, handleOpenEditForm],
    ),
  )

  // 当处于 split 偏好且 URL 带有 form 状态时，在右侧分屏内展开 UserFormView
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

      // 查看详情时，若此前处于表单打开状态，清理表单 URL 状态，解除两者的面板互斥
      if (formState.form) {
        void setFormState({ form: null, formId: null })
      }

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
    [appId, formState.form, navigate, openPreview, setFormState, t],
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
                    onClick={() => handleOpenEditForm(user)}
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
    [openUserDetail, schemaColumns, handleOpenEditForm, t],
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
          onAddRecord: handleOpenCreateForm,
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

      {/* 弹窗形态打开的统一表单（由 formOpenMode === 'dialog' 激活） */}
      <UserFormDialog
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
          void fetchUsers()
        }}
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
