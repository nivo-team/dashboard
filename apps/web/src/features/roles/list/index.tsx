import { Button, DropdownMenu, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThree, PencilSimple, PlusIcon, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  RoleItemSchema,
  deleteRoleByIdMutation,
  getRoleQueryKey,
  getRoleQueryOptions,
  postRoleMutation,
} from '#/api'
import type { RoleItem } from '#/api'
import {
  DataTable,
  createColumnHelper,
  stockFeatures,
  useSchemaColumns,
  useTable,
} from '#/components/data-table'
import type { ColumnRenderer, SchemaColumnSpec, StockFeatures } from '#/components/data-table'
import { DangerConfirmDialog } from '#/components/danger-confirm-dialog'
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { useFeature } from '#/features/ai/page'
import { useHasPermission } from '#/lib/permissions'
import { ROLE_STATUS } from '../role-form'
import { RoleFormDialog } from '../role-form-dialog'
import { createRoleListFeature } from './feature'

const columnHelper = createColumnHelper<StockFeatures, RoleItem>()

const MIN_COLUMN_WIDTH = 'min-w-[120px]'
const DEFAULT_PAGE_SIZE = 10

/** 默认隐藏列（列 id = 后端字段名）：默认**不隐藏**。 */
const DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

/**
 * 列顺序即白名单。ID 排第一（便于与后端数据对照），其余按「标识 → 说明 → 状态 → 派生 → 时间」。
 * 列 id 必须等于后端字段名（排序时直接作为 `field` 参数）。
 */
const ROLE_COLUMN_SPECS: (string | SchemaColumnSpec<RoleItem>)[] = [
  { field: 'id', render: 'code' },
  'name',
  { field: 'code', render: 'code' },
  'description',
  'status',
  'menu_count',
  'created_at',
]

/**
 * 角色列表（`/$appId/system/roles`）。
 *
 * 页面结构遵循 `src/features/example/table` 的薄容器模式：查询状态 + 表格 + 新建弹窗，
 * 表格列由运行时 schema 驱动（`RoleItemSchema`），列文案取 `roles:columns.*`。
 *
 * **编辑走详情页**（那里还要做菜单授权），列表页的弹窗只负责新建。
 */
export function RoleListPage() {
  const { t } = useTranslation('roles')
  const navigate = useNavigate()
  const toast = useKumoToastManager()
  const queryClient = useQueryClient()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoleItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 按钮级权限收口：与侧边栏 / 路由守卫 / AI 能力共用同一套判定
  const canCreate = useHasPermission('role:create')
  const canEdit = useHasPermission('role:edit')
  const canDelete = useHasPermission('role:delete')

  const query = useQuery(
    getRoleQueryOptions({
      query: {
        page,
        page_size: pageSize,
        kw: keyword || undefined,
      },
    }),
  )

  const items = query.data?.result?.items ?? []
  const total = query.data?.result?.total ?? 0

  const createMutation = useMutation(postRoleMutation())
  const deleteMutation = useMutation(deleteRoleByIdMutation())

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getRoleQueryKey() }),
    [queryClient],
  )

  const openDetail = useCallback(
    (role: RoleItem) => {
      void navigate({
        to: '/$appId/system/roles/$roleId',
        params: { appId, roleId: String(role.id) },
      })
    },
    [navigate, appId],
  )

  // 这一页对 AI 暴露的能力：角色数据源 + 重新取数（声明见 ./feature.ts）
  useFeature(
    createRoleListFeature({
      roles: items,
      loading: query.isPending || query.isFetching,
      reload: query.refetch,
    }),
  )

  const renderers = useMemo<Record<string, ColumnRenderer<RoleItem>>>(
    () => ({
      // 名称是进入详情的入口（列表点行也走同一个 openDetail）
      name: ({ row }) => (
        <button
          type="button"
          className="text-start font-medium text-kumo-default hover:underline"
          onClick={() => openDetail(row)}
        >
          {row.name}
        </button>
      ),
      status: ({ row, t: translate }) => (
        <span
          className={row.status === ROLE_STATUS.enabled ? 'text-kumo-success' : 'text-kumo-subtle'}
        >
          {row.status === ROLE_STATUS.enabled
            ? translate('status.enabled', '启用')
            : translate('status.disabled', '禁用')}
        </span>
      ),
    }),
    [openDetail],
  )

  const schemaColumns = useSchemaColumns<RoleItem>(RoleItemSchema, {
    ns: 'roles',
    columns: ROLE_COLUMN_SPECS,
    baseMeta: { headerClassName: MIN_COLUMN_WIDTH },
    renderers,
  })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...schemaColumns,
        // 操作列：编辑进详情页、删除走二次确认；两项都无权限时整列不渲染
        ...(canEdit || canDelete
          ? [
              columnHelper.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('columns.actions', '操作')}</span>,
                enableHiding: false,
                meta: { sticky: 'right' as const, cellClassName: 'text-end' },
                cell: ({ row }) => (
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
                      {canEdit ? (
                        <DropdownMenu.Item
                          className="gap-2"
                          onClick={() => openDetail(row.original)}
                        >
                          <PencilSimple size={16} />
                          <span>{t('rowActions.edit', '编辑')}</span>
                        </DropdownMenu.Item>
                      ) : null}
                      {canDelete ? (
                        <>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item
                            className="gap-2"
                            variant="danger"
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget(row.original)
                            }}
                          >
                            <Trash size={16} />
                            <span>{t('rowActions.delete', '删除')}</span>
                          </DropdownMenu.Item>
                        </>
                      ) : null}
                    </DropdownMenu.Content>
                  </DropdownMenu>
                ),
              }),
            ]
          : []),
      ]),
    [schemaColumns, canEdit, canDelete, openDetail, t],
  )

  const table = useTable({
    features: stockFeatures,
    data: items,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  })

  const errorMsg = query.isError
    ? ((query.error as { message?: string } | null)?.message ??
      t('messages.fetchFailed', '获取角色列表失败'))
    : null

  const handleCreate = useCallback(
    async (values: {
      name: string
      code: string
      description: string
      status: number
      sort: number
    }) => {
      setCreateError(null)
      try {
        await createMutation.mutateAsync({
          body: {
            name: values.name.trim(),
            code: values.code.trim(),
            description: values.description.trim(),
            status: values.status,
            sort: values.sort,
          },
        })
        await invalidate()
        toast.add({ title: t('form.successCreate', '角色创建成功'), variant: 'success' })
        setCreateOpen(false)
      } catch (submitError) {
        setCreateError(
          extractApiErrorMessage(submitError, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [createMutation, invalidate, toast, t],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteTarget.id } })
      await invalidate()
      toast.add({ title: t('detail.deleteSuccess', '角色删除成功'), variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteFailure) {
      setDeleteError(
        extractApiErrorMessage(deleteFailure, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteTarget, deleteMutation, invalidate, toast, t])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '角色管理')}
        description={t('description', '维护角色及其可见菜单，登录账号按角色码关联角色')}
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索角色名称 / 角色码…'),
          ariaLabel: t('table.search.ariaLabel', { ns: 'common', defaultValue: '搜索' }),
          value: searchInput,
          onChange: setSearchInput,
          onSearch: (value) => {
            setKeyword(value)
            setPage(1)
          },
          onClear: () => {
            setSearchInput('')
            setKeyword('')
            setPage(1)
          },
        }}
        table={table}
        actions={{
          onRefresh: () => {
            void query.refetch()
          },
          refreshLoading: query.isFetching,
          afterRefresh: canCreate ? (
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              onClick={() => {
                setCreateError(null)
                setCreateOpen(true)
              }}
            >
              {t('actions.create', '新建角色')}
            </Button>
          ) : undefined,
        }}
      />

      <DataTable
        table={table}
        loading={query.isPending}
        error={errorMsg}
        onRetry={() => {
          void query.refetch()
        }}
        onRowClick={openDetail}
        moduleName={t('title', '角色管理')}
        quotaText={
          <Trans
            i18nKey="quota"
            ns="roles"
            defaults="共 <b>{{total}}</b> 项"
            values={{ total }}
            components={{
              b: <b className="font-semibold text-kumo-default tabular-nums" />,
            }}
          />
        }
        emptyTitle={t('empty.title', '暂无角色')}
        emptyDescription={t('empty.description', '还没有角色，可用「新建角色」创建')}
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

      <RoleFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateError(null)
        }}
        submitting={createMutation.isPending}
        submitError={createError}
        onSubmit={(values) => {
          void handleCreate(values)
        }}
      />

      <DangerConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title={t('detail.deleteTitle', '删除角色')}
        description={
          <Trans
            i18nKey="detail.deleteConfirm"
            ns="roles"
            defaults="该操作不可撤销。将永久删除角色 <b>{{name}}</b> 及其菜单授权。"
            values={{ name: deleteTarget?.name ?? '' }}
            components={{ b: <b className="font-medium text-kumo-default" /> }}
          />
        }
        confirmationText={deleteTarget?.name ?? ''}
        confirmLabel={t('rowActions.delete', '删除')}
        cancelLabel={t('form.cancel', '取消')}
        loading={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={() => {
          void handleDeleteConfirm()
        }}
      />
    </div>
  )
}
