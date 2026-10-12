import { Button, DropdownMenu, LayerDialog, Table } from '@cloudflare/kumo'
import { DotsThree, PencilSimple, TicketIcon, Trash } from '@phosphor-icons/react'
import { parseAsInteger, parseAsString } from 'nuqs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteExampleTicketsById,
  getExampleTickets,
  patchExampleTicketsByIdStatus,
  TicketItemSchema,
} from '#/api'
import type { TicketItem } from '#/api'
import {
  createColumnHelper,
  DataTable,
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
import {
  CrudFloatingContainer,
  CrudViewContainer,
  useCrudView,
  type CrudController,
} from '#/components/crud'
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { useFeature } from '#/features/ai/page'
import { defineFilterParsers, useTableQuery } from '#/lib/list-query'
import type { QueryFilterField } from '#/api'
import { useHasPermission } from '#/lib/permissions'
import { useAppTableState } from '#/lib/store'
import { appToastManager } from '#/lib/toast'
import { toDisplayText } from '#/lib/to-text'
import {
  DEFAULT_HIDDEN_COLUMNS,
  MIN_COLUMN_WIDTH,
  TICKET_COLUMN_SPECS,
  TICKET_SORTABLE_FIELDS,
} from './columns'
import { createTicketsFeature } from './feature'
import { getTicketFormMetadata, TicketFormView } from './form-view'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'

const columnHelper = createColumnHelper<StockFeatures, TicketItem>()

const TICKET_FILTER_PARSERS = defineFilterParsers<
  NonNullable<Parameters<typeof getExampleTickets>[0]>['query']
>()({
  id: parseAsInteger,
  status: parseAsInteger,
  priority: parseAsInteger,
  category: parseAsString,
  assignee: parseAsString,
})

const TICKET_FILTER_FIELDS: QueryFilterField[] = [
  { name: 'id', param: 'id', label: '工单 ID', control: 'number' },
  {
    name: 'status',
    param: 'status',
    label: '状态',
    control: 'enum',
    options: ['1', '2', '3', '4'],
  },
  {
    name: 'priority',
    param: 'priority',
    label: '优先级',
    control: 'enum',
    options: ['1', '2', '3', '4'],
  },
  { name: 'assignee', param: 'assignee', label: '负责人', control: 'text' },
  { name: 'category', param: 'category', label: '分类', control: 'text' },
]

const STATUS_LABEL: Record<number, string> = {
  1: '待处理',
  2: '处理中',
  3: '已完成',
  4: '已关闭',
}

const PRIORITY_LABEL: Record<number, string> = {
  1: '低',
  2: '中',
  3: '高',
  4: '紧急',
}

export function TicketsListPage({ splat }: { splat?: string }) {
  const { t } = useTranslation('example', { keyPrefix: 'tickets' })
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const crud = useCrudView<TicketItem>({
    basePath: `/${appId}/example/tickets`,
    splat,
    enableDetail: false,
    getFormMetadata: (mode: 'create' | 'edit', id?: string | number) => {
      const meta = getTicketFormMetadata(mode, t)
      return {
        title: meta.title,
        description: mode === 'edit' && id ? `${meta.description} (ID ${id})` : meta.description,
      }
    },
  })

  // 1. 若当前命中独立整页沉浸态 (URL Path 触发)，不渲染背景列表
  if (crud.isPageMode) {
    return <TicketsPageMode crud={crud} />
  }

  // 2. 否则渲染标准列表 (带有浮层控制器)
  return <TicketsListContent crud={crud} />
}

/** 独立整页模式：表单沉浸式渲染 */
function TicketsPageMode({ crud }: { crud: CrudController<TicketItem> }) {
  if (crud.activeView.type !== 'page-form') return null

  return (
    <CrudViewContainer crud={crud}>
      <TicketFormView
        formId={crud.formId}
        mode={crud.activeView.mode}
        ticketId={crud.activeView.id}
        initialData={crud.formInitialData}
        onSuccess={crud.close}
        onClose={crud.close}
      />
    </CrudViewContainer>
  )
}

/** 列表模式：DataTable、搜索筛选、删除弹窗与浮层容器 */
function TicketsListContent({ crud }: { crud: CrudController<TicketItem> }) {
  const { t } = useTranslation('example', { keyPrefix: 'tickets' })

  const canCreate = useHasPermission('example:create')
  const canEdit = useHasPermission('example:edit')
  const canDelete = useHasPermission('example:delete')

  const {
    queryParams,
    pagination,
    search,
    sorting: tableSorting,
  } = useTableQuery({
    filterParsers: TICKET_FILTER_PARSERS,
    fields: TICKET_FILTER_FIELDS,
    defaultPage: 1,
    defaultPageSize: 15,
    defaultSortField: 'id',
    defaultSortOrder: 'desc',
  })

  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'example/tickets',
    'columnVisibility',
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TicketItem[]>([])
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false)
  const [deletingTicket, setDeletingTicket] = useState<TicketItem | null>(null)
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await getExampleTickets({ query: queryParams })
      const dataObj = res.data?.result
      const items = (dataObj?.items as TicketItem[]) ?? []
      setRows(items)
      setTotal(dataObj?.total ?? items.length)
    } catch (err) {
      setErrorMsg(toDisplayText(err))
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  const deleteOne = useCallback(
    async (id: number) => {
      const res = await deleteExampleTicketsById({ path: { id } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '删除工单失败')
      }
      appToastManager.add({
        title: t('messages.deleteSuccess', '工单已删除'),
        variant: 'success',
      })
      setSingleDeleteOpen(false)
      setDeletingTicket(null)
      await fetchRows()
      return { id }
    },
    [fetchRows, t],
  )

  const handleConfirmDelete = async () => {
    if (!deletingTicket?.id) return
    setSingleDeleteLoading(true)
    try {
      await deleteOne(deletingTicket.id)
    } finally {
      setSingleDeleteLoading(false)
    }
  }

  const updateStatus = useCallback(
    async (id: number, status: number) => {
      const res = await patchExampleTicketsByIdStatus({
        path: { id },
        body: { status },
      })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '更新工单状态失败')
      }
      appToastManager.add({
        title: t('messages.statusUpdateSuccess', '工单状态已更新为「{{status}}」', {
          status: STATUS_LABEL[status] ?? status,
        }),
        variant: 'success',
      })
      await fetchRows()
      return { id, status }
    },
    [fetchRows, t],
  )

  const columnRenderers = useMemo<Record<string, ColumnRenderer<TicketItem>>>(
    () => ({
      status: ({ value }) => {
        const num = Number(value)
        const text =
          STATUS_LABEL[num] ??
          (typeof value === 'string' || typeof value === 'number' ? String(value) : '-')
        const variantClass =
          num === 1
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : num === 2
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : num === 3
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-kumo-line text-kumo-subtle'
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClass}`}
          >
            {text}
          </span>
        )
      },
      priority: ({ value }) => {
        const num = Number(value)
        const text =
          PRIORITY_LABEL[num] ??
          (typeof value === 'string' || typeof value === 'number' ? String(value) : '-')
        const color =
          num === 4
            ? 'text-red-500'
            : num === 3
              ? 'text-amber-500'
              : num === 2
                ? 'text-blue-500'
                : 'text-kumo-subtle'
        return <span className={`text-xs font-medium ${color}`}>{text}</span>
      },
    }),
    [],
  )

  const schemaColumns = useSchemaColumns<TicketItem>(TicketItemSchema, {
    ns: 'example',
    keyPrefix: 'tickets',
    columns: TICKET_COLUMN_SPECS,
    sortable: TICKET_SORTABLE_FIELDS,
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
            const ticket = row.original
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
                  {canEdit && ticket.id !== undefined ? (
                    <DropdownMenu.Item
                      icon={PencilSimple}
                      onClick={() => crud.openEdit(ticket.id, ticket)}
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
                          setDeletingTicket(ticket)
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
    createTicketsFeature({
      rows,
      total,
      loading,
      queryState: queryParams as Record<string, unknown>,
      selectedIds: Object.keys(rowSelection)
        .map((k) => Number(k))
        .filter((id) => Number.isFinite(id)),
      deleteOne,
      updateStatus,
      openCreateForm: crud.openCreate,
      openEditForm: (id, initialValues) =>
        crud.openEdit(id, (initialValues ?? { id, title: '' }) as TicketItem),
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '工单管理')}
        description={t('description', '工单的创建、分派、处理与关闭。')}
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索 ID / 标题 / 描述 / 负责人…'),
          ariaLabel: t('table.search.ariaLabel', { ns: 'common', defaultValue: '搜索' }),
          value: search.value,
          onChange: search.onChange,
          onSearch: search.onSearch,
          onClear: search.onClear,
        }}
        table={table}
        actions={{
          onAddRecord: canCreate ? () => crud.openCreate() : undefined,
          addRecordLabel: t('actions.create', '新建工单'),
          onRefresh: () => {
            void fetchRows()
          },
          refreshLoading: loading,
        }}
      />

      <DataTable
        table={table}
        onRowClick={(ticket) => ticket.id !== undefined && canEdit && crud.openEdit(ticket.id, ticket)}
        loading={loading}
        error={errorMsg}
        onRetry={fetchRows}
        moduleName={t('moduleName', '工单')}
        emptyTitle={t('empty.title', '暂无工单数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的工单，请尝试更换关键词或重置筛选条件',
        )}
        emptyIcon={<TicketIcon size={44} className="text-kumo-inactive" />}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          onPageChange: pagination.onPageChange,
          onPageSizeChange: pagination.onPageSizeChange,
        }}
      />

      {/* 浮层外壳容器 */}
      <CrudFloatingContainer
        crud={crud}
        renderForm={(ctx) => (
          <TicketFormView
            formId={ctx.formId}
            mode={ctx.mode}
            ticketId={ctx.id}
            initialData={ctx.initialData}
            hideActions={ctx.hideActions}
            onSuccess={() => {
              ctx.close()
              void fetchRows()
            }}
            onClose={ctx.close}
          />
        )}
      />

      {/* 删除二次确认 */}
      <LayerDialog.Alert open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>{t('dialogs.deleteTitle', '删除工单')}</LayerDialog.Title>
          <LayerDialog.Description>
            {t('dialogs.deleteConfirm', '确定要删除工单「{{name}}」吗？该操作不可撤销。', {
              name: deletingTicket?.title || deletingTicket?.id,
            })}
          </LayerDialog.Description>
          <LayerDialog.Body>{null}</LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={handleConfirmDelete}
              loading={singleDeleteLoading}
            >
              {t('dialogs.delete', '删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </div>
  )
}
