import { Button, DropdownMenu, LayerDialog, Table } from '@cloudflare/kumo'
import { DotsThree, PencilSimple, TicketIcon, Trash } from '@phosphor-icons/react'
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteTicketById, getTicket, patchTicketByIdStatus, TicketItemSchema } from '#/api'
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
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { useFeature } from '#/features/ai/page'
import { defineFilterParsers, useTableQuery } from '#/lib/list-query'
import type { QueryFilterField } from '#/api'
import { useHasPermission } from '#/lib/permissions'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { useAppTableState, usePreferencesStore } from '#/lib/store'
import { appToastManager } from '#/lib/toast'
import { toDisplayText } from '#/lib/to-text'
import {
  DEFAULT_HIDDEN_COLUMNS,
  MIN_COLUMN_WIDTH,
  TICKET_COLUMN_SPECS,
  TICKET_SORTABLE_FIELDS,
} from './columns'
import { createTicketsFeature } from './feature'
import { TicketFormDialog } from './form-dialog'
import { getTicketFormMetadata, TicketFormView } from './form-view'
import { useDetailPreview } from '#/components/detail-preview'
import { useNavigate } from '@tanstack/react-router'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'

/**
 * 示例 / 工单管理（`/$appId/example/tickets`）。
 *
 * ## 这一页为什么存在
 *
 * 它是「**后端没有批量接口**」的标准样板：只有单条的增删改查 + 一个独立的状态接口。
 * 页面上也不提供批量删除按钮 —— 「把这一屏待处理的都关掉」这类请求，只能靠 AI
 * 用 `manage_tasks` 把 N 次单条调用编排成一份计划、顺序执行（见 `./feature.ts`）。
 *
 * 于是它同时是 AI 自主编排能力的**验收场**：如果编排没做好，模型会退化成
 * "循环调用单条接口"，在界面上表现为任务卡一闪而过、Todo 进度不推进。
 */
const columnHelper = createColumnHelper<StockFeatures, TicketItem>()

const TICKET_FILTER_PARSERS = defineFilterParsers<
  NonNullable<Parameters<typeof getTicket>[0]>['query']
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

export function TicketsListPage() {
  const { t } = useTranslation('tickets')
  const { open: openPreview } = useDetailPreview()
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  // 表单打开方式是用户偏好（弹窗 / 分屏 / 独立页）；移动端一律降级为独立页
  const formOpenMode = usePreferencesStore((s) => s.formOpenMode)
  const isMobile = useIsMobileViewport()

  const canCreate = useHasPermission('ticket:create')
  const canEdit = useHasPermission('ticket:edit')
  const canDelete = useHasPermission('ticket:delete')
  const canUpdate = useHasPermission('ticket:update')

  const {
    queryParams,
    pagination,
    search,
    sorting: tableSorting,
    filters: tableFilters,
  } = useTableQuery({
    filterParsers: TICKET_FILTER_PARSERS,
    fields: TICKET_FILTER_FIELDS,
    defaultPage: 1,
    defaultPageSize: 15,
    defaultSortField: 'created_at',
    defaultSortOrder: 'desc',
  })

  // 表单打开状态同步到 URL（支持分享 / 刷新复现 / 由 AI 唤起）
  const [formState, setFormState] = useQueryStates(
    {
      form: parseAsStringLiteral(['create', 'edit'] as const),
      formId: parseAsInteger,
    },
    { history: 'replace', shallow: false, clearOnDefault: true },
  )

  const [formInitialData, setFormInitialData] = useState<TicketItem | null>(null)
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

  const [deletingTicket, setDeletingTicket] = useState<TicketItem | null>(null)
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false)
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await getTicket({ query: queryParams })
      const dataObj = res.data?.result
      const items = (dataObj?.items as TicketItem[]) ?? []
      setRows(items)
      setTotal(dataObj?.total ?? items.length)
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : t('messages.fetchFailed', '获取工单列表失败'),
      )
    } finally {
      setLoading(false)
    }
  }, [queryParams, t])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  /* ── 删除：页面自己的实现（接口 + toast + 刷新），AI 指令与页面按钮共用同一段 ── */
  const deleteOne = useCallback(
    async (id: number) => {
      const res = await deleteTicketById({ path: { id } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '删除工单失败')
      }
      appToastManager.add({
        title: t('messages.deleteSuccess', '删除工单成功'),
        variant: 'success',
      })
      setSingleDeleteOpen(false)
      setDeletingTicket(null)
      await fetchRows()
      return { id }
    },
    [fetchRows, t],
  )

  /* ── 变更状态：同上。批量改状态时 AI 会把它编排进任务清单，逐条执行 ── */
  const updateStatus = useCallback(
    async (id: number, status: number) => {
      const res = await patchTicketByIdStatus({ path: { id }, body: { status } })
      if (res.data?.code !== 0) {
        throw new Error(res.data?.message || '变更状态失败')
      }
      appToastManager.add({
        title: t('messages.statusUpdated', '已改为「{{status}}」', {
          status: STATUS_LABEL[status] ?? status,
        }),
        variant: 'success',
      })
      await fetchRows()
      return { id, status }
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

  /* ── 表单打开：按用户的「表单打开方式」偏好分流（与表格示例同一套）── */
  const openFormSplit = useCallback(
    (mode: 'create' | 'edit', id?: number | null, initialData?: TicketItem | null) => {
      const isEdit = mode === 'edit'
      const meta = getTicketFormMetadata(mode, t)
      openPreview({
        key: isEdit ? `ticket-form-edit-${id}` : 'ticket-form-create',
        title: meta.title,
        description: isEdit && id ? `${meta.description} (ID ${id})` : meta.description,
        mode: 'split',
        // 「展开」= 去独立页表单（与 table-example 同一约定）
        onExpand: () => {
          void navigate({
            to: isEdit ? '/$appId/example/tickets/$id/edit' : '/$appId/example/tickets/new',
            params: isEdit ? { appId, id: String(id) } : { appId },
          })
        },
        onClose: () => {
          void setFormState({ form: null, formId: null })
          setFormInitialData(null)
        },
        render: ({ close }) => (
          <TicketFormView
            variant="split"
            mode={mode}
            ticketId={id}
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

  const handleOpenCreateForm = useCallback(
    (initialValues?: Partial<TicketItem> | null) => {
      const initData = initialValues ? ({ id: 0, title: '', ...initialValues } as TicketItem) : null
      setFormInitialData(initData)
      if (formOpenMode === 'page' || isMobile) {
        void navigate({ to: '/$appId/example/tickets/new', params: { appId } })
        return
      }
      void setFormState({ form: 'create', formId: null })
      if (formOpenMode === 'split') openFormSplit('create', null, initData)
    },
    [formOpenMode, isMobile, navigate, appId, setFormState, openFormSplit],
  )

  const handleOpenEditForm = useCallback(
    (ticket: TicketItem, initialValues?: Partial<TicketItem> | null) => {
      const merged = initialValues ? { ...ticket, ...initialValues } : ticket
      setFormInitialData(merged)
      if (formOpenMode === 'page' || isMobile) {
        void navigate({
          to: '/$appId/example/tickets/$id/edit',
          params: { appId, id: String(ticket.id) },
        })
        return
      }
      void setFormState({ form: 'edit', formId: ticket.id })
      if (formOpenMode === 'split') openFormSplit('edit', ticket.id, merged)
    },
    [formOpenMode, isMobile, navigate, appId, setFormState, openFormSplit],
  )

  // split 偏好且 URL 带表单状态时，在右侧分屏内展开（支持刷新复现 / AI 唤起）
  useEffect(() => {
    if (formOpenMode === 'split' && formState.form) {
      openFormSplit(formState.form, formState.formId)
    }
  }, [formState.form, formState.formId, formOpenMode, openFormSplit])

  /* ── 列 ── */
  const columnRenderers = useMemo<Record<string, ColumnRenderer<TicketItem>>>(
    () => ({
      status: ({ value }) => {
        const num = Number(value)
        return (
          <span className="text-kumo-default">
            {STATUS_LABEL[num] ??
              (value === null || value === undefined ? '-' : toDisplayText(value))}
          </span>
        )
      },
      priority: ({ value }) => {
        const num = Number(value)
        return (
          <span className="text-kumo-default">
            {PRIORITY_LABEL[num] ??
              (value === null || value === undefined ? '-' : toDisplayText(value))}
          </span>
        )
      },
    }),
    [],
  )

  const schemaColumns = useSchemaColumns<TicketItem>(TicketItemSchema, {
    ns: 'tickets',
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
              aria-label={t('cell.selectAll', '全选当前页')}
            />
          ),
          cell: ({ row }) => (
            <Table.CheckCell
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(!!checked)}
              aria-label={t('cell.selectRow', '选择 {{name}}', { name: row.original.title })}
            />
          ),
        }),
        ...schemaColumns,
        columnHelper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions', '操作')}</span>,
          enableHiding: false,
          meta: { sticky: 'right', cellClassName: 'text-end' },
          cell: ({ row }) => {
            const ticket = row.original
            const canStatus = canUpdate
            const showAnything = canEdit || canDelete || canStatus
            if (!showAnything) return null
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
                  {canEdit ? (
                    <DropdownMenu.Item
                      icon={PencilSimple}
                      onClick={() => handleOpenEditForm(ticket)}
                    >
                      {t('rowActions.edit', '编辑')}
                    </DropdownMenu.Item>
                  ) : null}
                  {canStatus && ticket.id !== undefined ? (
                    <>
                      {ticket.status === 1 ? (
                        <DropdownMenu.Item onClick={() => void updateStatus(ticket.id!, 2)}>
                          {t('rowActions.start', '开始处理')}
                        </DropdownMenu.Item>
                      ) : null}
                      {ticket.status !== 3 ? (
                        <DropdownMenu.Item onClick={() => void updateStatus(ticket.id!, 3)}>
                          {t('rowActions.finish', '标记完成')}
                        </DropdownMenu.Item>
                      ) : null}
                      {ticket.status !== 4 ? (
                        <DropdownMenu.Item onClick={() => void updateStatus(ticket.id!, 4)}>
                          {t('rowActions.close', '关闭工单')}
                        </DropdownMenu.Item>
                      ) : null}
                    </>
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
    [schemaColumns, canEdit, canDelete, canUpdate, handleOpenEditForm, updateStatus, t],
  )

  /* ── 这一页对 AI 暴露的全部能力，只在这一处登记 ── */
  useFeature(
    createTicketsFeature({
      rows,
      total,
      loading,
      queryState: { ...queryParams, filters: tableFilters.appliedFilters } as Record<
        string,
        unknown
      >,
      selectedIds: Object.keys(rowSelection)
        .map((key) => Number(key))
        .filter((id) => Number.isFinite(id)),
      deleteOne,
      updateStatus,
      openCreateForm: handleOpenCreateForm,
      openEditForm: (id, initialValues) =>
        handleOpenEditForm({ id, title: '' } as TicketItem, initialValues),
      reload: fetchRows,
    }),
  )

  const table = useTable({
    features: stockFeatures,
    data: rows,
    columns,
    state: { sorting: tableSorting.sorting, columnVisibility, rowSelection },
    onSortingChange: tableSorting.onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '工单管理')}
        description={t('description', '单条增删改查示例：后端没有批量接口，批量操作由 AI 编排')}
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
          onAddRecord: canCreate ? handleOpenCreateForm : undefined,
          addRecordLabel: t('actions.create', '新建工单'),
          onRefresh: () => void fetchRows(),
          refreshLoading: loading,
        }}
      />

      <DataTable
        table={table}
        loading={loading}
        error={errorMsg}
        onRetry={fetchRows}
        moduleName={t('moduleName', '工单')}
        emptyTitle={t('empty.title', '暂无工单')}
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

      {/* 弹窗形态（formOpenMode === 'dialog' 时激活）：新建与编辑共用一份实现 */}
      <TicketFormDialog
        open={formOpenMode === 'dialog' && !!formState.form}
        onOpenChange={(open) => {
          if (!open) {
            void setFormState({ form: null, formId: null })
            setFormInitialData(null)
          }
        }}
        mode={formState.form === 'edit' ? 'edit' : 'create'}
        ticketId={formState.formId}
        initialData={formInitialData}
        onSuccess={() => {
          void setFormState({ form: null, formId: null })
          setFormInitialData(null)
          void fetchRows()
        }}
      />

      {/* 单条删除二次确认 */}
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
