import { Button, DropdownMenu, Table } from '@cloudflare/kumo'
import {
  DotsThree,
  Eye,
  PencilSimple,
  Trash,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getUser, UserItemSchema } from '#/api'
import type { GetUserData, UserItem } from '#/api'
import { buildQueryFromFilters } from '#/api/query-filters'
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
  SortingState,
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
import { DEMO_USERS } from './-data/demo-users'
import { useFormatTimestamp } from './-data/user-display'
import { UserDetailView } from './-components/user-detail-view'

/**
 * 用户运营 / 用户列表（/$appId/users/user）
 *
 * 列编排约定：一列只呈现一项数据 ——
 * 标量字段独占一列；嵌套对象（country / guild / extend）把内部字段展开成各自的列；
 */
export const Route = createFileRoute('/$appId/users/user/')({
  component: UserListPage,
})

/** 数据列统一最小宽度：宽表下避免列被挤压成折行。 */
const MIN_COLUMN_WIDTH = 'min-w-[120px]'

/** 默认隐藏的列：扩展/展开字段默认收起，可通过「显示选项」按需打开。 */
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

function UserListPage() {
  /*
    把这个页面「是什么、用了哪些接口」交给 AI —— 键用 `Route.id` 而不是手写字符串：
    路由模板重命名时它会跟着走，手写的字符串会在某次重构后**静默失配**，
    然后 AI 就又不声不响地回去猜接口了。

    接口的**参数明细刻意不写在这里**：`get_page_context` 会从 openapi 索引自动补上。
  */
  useAiPageContext(Route.id, {
    description: '用户列表：分页浏览用户，支持关键词搜索；点击行可打开某个用户的详情。',
    entities: ['用户', '昵称', '邮箱', '注册时间'],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        purpose: '分页查询用户列表；kw 按昵称与邮箱模糊匹配',
      },
    ],
  })

  const { t } = useTranslation('users')
  const navigate = useNavigate()
  // 只取 open：它在 Provider 内是稳定引用，不会因为浮层开合导致表格列被反复重建
  const { open: openPreview } = useDetailPreview()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const formatTimestamp = useFormatTimestamp()

  // 搜索关键字（Query 参数）
  const [searchInput, setSearchInput] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')

  // 高级过滤器状态：草稿（弹窗内编辑）与已应用（驱动查询）分离
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState<FilterCondition[]>([])
  // 已应用的筛选条件按应用隔离持久化（弹窗内的草稿 filterDraft 不持久化）
  const [appliedFilters, setAppliedFilters] = useAppTableState<FilterCondition[]>(
    'users/user',
    'filters',
    [],
  )
  /** 从 chips 进入时要聚焦的条件 id */
  const [focusConditionId, setFocusConditionId] = useState<string | null>(null)

  // 分页状态：按应用隔离持久化，切回来仍是上次的页码
  const [page, setPage] = useAppTableState<number>('users/user', 'page', 1)
  const [pageSize, setPageSize] = useAppTableState<number>('users/user', 'pageSize', 15)

  // 数据交互与加载状态
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  /** 是否已成功拿到过真实数据，用于避免把空态误判为鉴权失效 */
  const hasDataRef = useRef(false)

  // 生效中的筛选条件（仅统计已填写取值的条件）
  const effectiveAppliedFilters = useMemo(
    () =>
      appliedFilters.filter(
        (item) => item.value !== '' || (item.valueTo ?? '') !== '',
      ),
    [appliedFilters],
  )

  const activeFilterCount = effectiveAppliedFilters.length

  /**
   * 走字典的筛选字段：param → 字典选项（含当前语言文案）。
   *
   * 生成产物 `USER_FILTER_FIELDS` 里的 `options` 是从 openapi enum 提取的静态值，
   * 只有 value、也没有多语言；这里用后端字典覆盖它（见 .agents/docs/dict-options.md）。
   * 需要多语言文案时，在这里把筛选参数映射到字典分类即可；
   * 当前没有走字典的筛选字段，因此是一张空表。
   */
  const dictFilterEntries = useMemo<Record<string, readonly DictOptionEntry[]>>(
    () => ({}),
    [],
  )

  /** 枚举字段的候选项：过滤掉字典里 disabled 的项，文案取字典文案 */
  const resolveFilterFieldOptions = useCallback<ResolveFilterFieldOptions>(
    (field) => {
      const entries = dictFilterEntries[field.param]
      // 字典未就绪（还没加载完）或该分类没有选项时返回 undefined，
      // 让控件回退到生成产物里的静态 options —— 否则会得到一个空候选的下拉
      if (!entries || entries.length === 0) return undefined
      return entries
        .filter((entry) => !entry.disabled)
        .map((entry) => ({ value: entry.value, label: entry.text }))
    },
    [dictFilterEntries],
  )

  /** 已应用条件的 chip 文案：枚举字段显示字典文案，而不是原始 value */
  const dictFilterOptionLabel = useCallback(
    (field: { param: string }, value: string) =>
      dictFilterEntries[field.param]?.find((entry) => entry.value === value)?.text,
    [dictFilterEntries],
  )

  // 工具栏下方 chips 的展示文本（如「昵称 abc」「注册时间 2026-01-01 ~ 2026-06-30」）
  const activeFilterItems = useMemo(
    () =>
      effectiveAppliedFilters.map((condition) => ({
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
    [effectiveAppliedFilters, t, dictFilterOptionLabel],
  )

  // TanStack Table 状态受控驱动（排序、列可见性、多选）
  const [sorting, setSorting] = useAppTableState<SortingState>('users/user', 'sorting', [
    { id: 'createtime', desc: true },
  ])
  // 列设置按应用隔离持久化：同一张表在 Console / Analytics 下各存一份
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'users/user',
    'columnVisibility',
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // 执行 API 数据获取
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    const activeSort = sorting[0]
    const sortFieldParam = activeSort?.id || 'createtime'
    const sortOrderParam = activeSort?.desc ? 'desc' : 'asc'

    try {
      const res = await getUser({
        query: {
          page,
          page_size: pageSize,
          kw: activeKeyword ? activeKeyword : undefined,
          field: sortFieldParam,
          order: sortOrderParam,
          // 筛选条件统一由参数目录映射，覆盖 GET /user 除 primary 参数
          // （kw / page / page_size / field / order / time_field / range_time）外的全部 query 参数
          ...buildQueryFromFilters(appliedFilters, USER_FILTER_FIELDS),
        } as GetUserData['query'],
      })

      const dataObj = res.data?.result
      const items = (dataObj?.items as UserItem[]) ?? []
      const totalCount = dataObj?.total ?? items.length

      if (res.response && !res.response.ok && items.length === 0) {
        setErrorMsg(res.data?.message || i18n.t('users:messages.fetchFailed', { defaultValue: '获取用户列表失败' }))
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
  }, [page, pageSize, activeKeyword, appliedFilters, sorting])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // 搜索触发
  const handleTriggerSearch = () => {
    setPage(1)
    setActiveKeyword(searchInput.trim())
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setActiveKeyword('')
    setPage(1)
  }

  // 打开/关闭筛选器：关闭时清理聚焦目标，避免下次打开仍高亮旧条件
  const handleFiltersOpenChange = (open: boolean) => {
    setFiltersOpen(open)
    if (!open) setFocusConditionId(null)
  }

  // 应用筛选：草稿生效并重新查询
  const handleApplyFilters = () => {
    setAppliedFilters(filterDraft)
    setFiltersOpen(false)
    setPage(1)
  }

  // 全部清除：草稿与已应用条件一并清空并重新查询
  const handleClearFilters = () => {
    setFilterDraft([])
    setAppliedFilters([])
    setFiltersOpen(false)
    setPage(1)
  }

  // 移除单个条件：草稿同步，避免重新打开筛选器时该条件仍在
  const handleRemoveFilter = (id: string) => {
    setAppliedFilters((prev) => prev.filter((condition) => condition.id !== id))
    setFilterDraft((prev) => prev.filter((condition) => condition.id !== id))
    setPage(1)
  }

  /**
   * 打开用户详情 —— 走「详情预览」统一入口：
   *
   * - 打开方式由本机偏好决定（设置 → 外观 → 通用设置）：分屏 / 抽屉 / 跳转详情页；
   * - **移动端一律跳转详情页**，这条降级规则收在 `useDetailPreview().open()` 里，
   *   页面不需要自己判断视口；
   * - 浮层里渲染的就是详情路由用的那个 `UserDetailView`（`variant="preview"`），
   *   「展开」按钮由浮层容器提供 → 关闭浮层 + 导航到 `/$appId/users/user/$id`。
   *
   * 名称按钮、头像、行内菜单的「查看 / 编辑」以及**整行点击**都汇到这一个函数，
   * 因此四个入口的行为永远一致。
   */
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

  /** 模块定制的单元格渲染器：schema 列通过 render 名称引用，通用渲染器由适配器内置。 */
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

  // 数据列：顺序、渲染器与可排序字段来自上面的编排，其余（列、文案）由 schema 与 i18n 提供
  const schemaColumns = useSchemaColumns<UserItem>(UserItemSchema, {
    ns: 'users',
    columns: USER_COLUMN_SPECS,
    sortable: SORTABLE_FIELDS,
    baseMeta: { headerClassName: MIN_COLUMN_WIDTH },
    renderers: columnRenderers,
  })

  // 基于 TanStack Table 定义各列：schema 数据列 + 多选 / 头像 / 操作等自定义列
  const columns = useMemo(
    () =>
      columnHelper.columns([
        // 多选列（非数据列，固定显示且不可隐藏）
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

        // 头像
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

        // 操作列（无标题，自适应宽度）
        columnHelper.display({
          id: 'actions',
          header: () => (
            <span className="sr-only">{t('columns.actions', '操作')}</span>
          ),
          enableHiding: false,
          meta: {
            sticky: 'right',
            // 操作列吸「行尾」：LTR 靠右、RTL 靠左；对齐用逻辑属性 text-end 跟随同侧
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
                    onClick={() => openUserDetail(user)}
                  >
                    {t('rowActions.edit', '编辑')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    icon={Trash}
                    variant="danger"
                    onClick={() => {
                      // 预留单项删除逻辑
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

  // 核心：创建 TanStack Table 实例接管表格全部状态、列模型与行模型
  const table = useTable({
    features: stockFeatures,
    data: users,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
  })

  // 导出选中的或当前可见的用户数据为 CSV
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

    const csvContent = '﻿' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
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

      {/* 规范化通用查询控制栏 (TableControls)：将 table 作为插件接入 */}
      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索 ID / 昵称 / 邮箱…'),
          // 复用 common 命名空间下的通用表格搜索文案：
          // 本页默认命名空间是 users，而 table 只是 common 下的根键、并非独立命名空间，
          // 故必须显式指定 ns，否则任何语言都会回落到中文 defaultValue
          ariaLabel: t('table.search.ariaLabel', {
            ns: 'common',
            defaultValue: '搜索',
          }),
          value: searchInput,
          onChange: setSearchInput,
          onSearch: handleTriggerSearch,
          onClear: handleClearSearch,
        }}
        filters={{
          open: filtersOpen,
          onOpenChange: handleFiltersOpenChange,
          activeCount: activeFilterCount,
          children: (
            <FilterBuilder
              fields={USER_FILTER_FIELDS}
              value={filterDraft}
              onChange={setFilterDraft}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              onClose={() => handleFiltersOpenChange(false)}
              focusConditionId={focusConditionId ?? undefined}
              // 字段目录来自 openapi 生成的 query 参数目录；枚举字段的候选再用后端字典覆盖
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
          onRemove: handleRemoveFilter,
          onClearAll: handleClearFilters,
        }}
        table={table}
        actions={{
          onExport: handleExportCSV,
          onRefresh: () => {
            void fetchUsers()
          },
          refreshLoading: loading,
        }}
      />

      {/* 表格控制与渲染全部托管至 TanStack Table + Kumo DataTable */}
      <DataTable
        table={table}
        // 整行可点：点任意处都走统一的详情入口（行内按钮 / 复选框 / 菜单不会误触发）
        onRowClick={openUserDetail}
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
        emptyDescription={t('empty.description', '未找到符合条件的用户，请尝试更换关键词或重置筛选条件')}
        emptyIcon={<UsersIcon size={44} className="text-kumo-inactive" />}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />
    </div>
  )
}
