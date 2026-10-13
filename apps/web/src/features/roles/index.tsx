import { Button, DropdownMenu, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThree, PencilSimple, PlusIcon, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  CrudViewport,
  useCrudView,
} from '#/components/crud'
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
import { RoleDetailPage } from './detail'
import { createRoleListFeature } from './list/feature'
import { ROLE_STATUS, RoleForm, type RoleFormValues } from './role-form'

const columnHelper = createColumnHelper<StockFeatures, RoleItem>()

const MIN_COLUMN_WIDTH = 'min-w-[120px]'
const DEFAULT_PAGE_SIZE = 10
const DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

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
 * 角色管理总控页面（`/$appId/system/roles` 与 `/$appId/system/roles/$`）。
 * 遵循 Single-Route & CrudView 规范，单文件编排列表、整页详情与新建弹窗/整页。
 */
export function RoleListPage({ splat }: { splat?: string }) {
  const { t } = useTranslation('roles')
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const crud = useCrudView<RoleItem>({
    basePath: `/${appId}/system/roles`,
    splat,
    enableDetail: true,
    getFormMetadata: () => ({
      title: t('form.createTitle', '新建角色'),
      description: t('form.createDescription', '创建后到详情页为它分配可见菜单'),
    }),
    getDetailMetadata: (id) => ({
      title: t('title', '角色管理'),
      description: `ID ${id}`,
    }),
  })

  const toast = useKumoToastManager()
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoleItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  // 这一页对 AI 暴露的能力
  useFeature(
    createRoleListFeature({
      roles: items,
      loading: query.isPending || query.isFetching,
      reload: query.refetch,
    }),
  )

  const renderers = useMemo<Record<string, ColumnRenderer<RoleItem>>>(
    () => ({
      name: ({ row }) => (
        <button
          type="button"
          className="text-start font-medium text-kumo-default hover:underline"
          onClick={() => crud.openDetail(row.id)}
        >
          {row.name}
        </button>
      ),
      status: ({ value }) => {
        const isEnabled = Number(value) === ROLE_STATUS.enabled
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              isEnabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-kumo-line text-kumo-subtle'
            }`}
          >
            {isEnabled ? t('form.statusEnabled', '启用') : t('form.statusDisabled', '禁用')}
          </span>
        )
      },
      menu_count: ({ value }) => (
        <span className="font-mono text-xs text-kumo-subtle">
          {t('columns.menuCountValue', '{{count}} 项', { count: Number(value) || 0 })}
        </span>
      ),
    }),
    [crud, t],
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
        columnHelper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions', '操作')}</span>,
          enableHiding: false,
          meta: {
            sticky: 'right',
            cellClassName: 'text-end',
          },
          cell: ({ row }) => {
            const role = row.original
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
                    icon={PencilSimple}
                    onClick={() => crud.openDetail(role.id)}
                  >
                    {canEdit ? t('rowActions.edit', '配置') : t('rowActions.view', '查看')}
                  </DropdownMenu.Item>
                  {canDelete ? (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        icon={Trash}
                        variant="danger"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(role)
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
    [schemaColumns, canEdit, canDelete, crud, t],
  )

  const table = useTable({
    features: stockFeatures,
    data: items,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  })

  const handleCreate = useCallback(
    async (values: RoleFormValues, close: () => void) => {
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
        close()
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

  const errorMsg = query.isError
    ? extractApiErrorMessage(query.error, t('messages.fetchFailed', '获取角色列表失败'))
    : null

  return (
    <div className="flex flex-col gap-4">
      <CrudViewport
        crud={crud}
        dialogSize="sm"
        saveLabel={t('form.create', '创建')}
        pageDetailWrapper="none"
        renderForm={(ctx) => (
          <RoleForm
            formId={ctx.formId}
            submitting={createMutation.isPending}
            submitError={createError}
            onSubmit={(values) => void handleCreate(values, ctx.close)}
            onCancel={ctx.close}
          />
        )}
        renderDetail={(ctx) => (
          <RoleDetailPage roleId={ctx.id} onBack={ctx.close} />
        )}
      >
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
                crud.openCreate()
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
        onRowClick={(role) => crud.openDetail(role.id)}
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
        confirmLabel={t('detail.deleteAction', '确认删除')}
        cancelLabel={t('form.cancel', '取消')}
        loading={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </CrudViewport>
  </div>
  )
}
