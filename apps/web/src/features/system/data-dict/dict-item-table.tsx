import {
  Button,
  DropdownMenu,
  LayerDialog,
  Select,
  useKumoToastManager,
} from '@cloudflare/kumo'
import { DotsThree, ListBulletsIcon, PencilSimple, PlusIcon, Trash } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deleteDataDictByIdMutation,
  postDataDictMutation,
  putDataDictMutation,
} from '#/api'
import {
  DataTable,
  createColumnHelper,
  stockFeatures,
  useTable,
} from '#/components/data-table'
import type { ColumnVisibilityState, StockFeatures } from '#/components/data-table'
import { useAppTableState } from '#/lib/store'
import { TableControls } from '#/components/table-controls'
import { extractApiErrorMessage } from '#/lib/api-error'
import {
  DICT_ITEM_DEFAULT_HIDDEN_COLUMNS,
  useDictItemColumns,
} from './data-dict-columns'
import { DEFAULT_PAGE_SIZE, DICT_STATUS } from './data-dict-options'
import type { DictItem, DictItemFormValues } from './data-dict-types'
import { useDictItems, useInvalidateDictItems } from './use-dict-items'
import { DictItemFormDialog } from './dict-item-form-dialog'

const columnHelper = createColumnHelper<StockFeatures, DictItem>()

/**
 * 字典项表格（**服务端分页**）。
 *
 * 这是本模块与 features 的分水岭：features 是「一棵树 + 本地切片」，
 * 这里 `GET /data_dict` 是带 `kw` / `status` / `page` / `page_size` 的服务端分页接口，
 * 因此搜索、状态筛选与翻页都直接驱动请求（不做本地过滤），分页控件用后端返回的 `total`。
 */

interface DictItemTableProps {
  /** 所属分类 id。 */
  typeId: number
  /** 所属分类名称（弹窗里说明归属）。 */
  typeName?: string
}

/** 状态筛选项：`all` 表示不筛（映射为 `undefined`）。 */
type StatusFilter = 'all' | typeof DICT_STATUS.enabled | typeof DICT_STATUS.disabled

export function DictItemTable({ typeId, typeName }: DictItemTableProps) {
  const { t } = useTranslation('dataDict')
  const toast = useKumoToastManager()

  const invalidateItems = useInvalidateDictItems()
  const createItemMutation = useMutation(postDataDictMutation())
  const updateItemMutation = useMutation(putDataDictMutation())
  const deleteItemMutation = useMutation(deleteDataDictByIdMutation())

  // 服务端查询参数（搜索框输入与「已生效关键词」分离，回车或点击搜索才生效）
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [page, setPage] = useAppTableState<number>('system/data-dict/item', 'page', 1)
  const [pageSize, setPageSize] = useAppTableState<number>('system/data-dict/item', 'pageSize', DEFAULT_PAGE_SIZE)

  // 列设置按应用隔离持久化：同一张表在 Console / Analytics 下各存一份
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'system/data-dict/item',
    'columnVisibility',
    () => Object.fromEntries(DICT_ITEM_DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  // 弹窗状态
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<DictItem | undefined>()
  const [editOpen, setEditOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DictItem | undefined>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { items, total, isPending, isFetching, error, refetch } = useDictItems({
    typeId,
    keyword,
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    pageSize,
  })

  // 切换分类时把分页与搜索收敛回初始状态：新分类的项更少时，沿用旧页码会停在空白页
  useEffect(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('all')
    setPage(1)
  }, [typeId])

  const itemColumns = useDictItemColumns()

  const errorMsg = error
    ? ((error as { message?: string } | null)?.message ??
      t('messages.itemsFetchFailed', '获取字典项列表失败'))
    : null

  /** 写入（新建 / 编辑）：有 `id` 走 PUT，否则走 POST。 */
  const handleSubmit = useCallback(
    async (values: DictItemFormValues) => {
      setFormError(null)
      try {
        if (values.id === undefined || values.id === null) {
          await createItemMutation.mutateAsync({
            body: {
              type_id: values.type_id,
              label: values.label,
              value: values.value,
              status: values.status,
              is_default: values.is_default,
              sort: values.sort,
              remark: values.remark,
            },
          })
        } else {
          await updateItemMutation.mutateAsync({
            body: {
              id: values.id,
              type_id: values.type_id,
              label: values.label,
              value: values.value,
              status: values.status,
              is_default: values.is_default,
              sort: values.sort,
              remark: values.remark,
            },
          })
        }

        await invalidateItems()
        toast.add({
          title:
            values.id === undefined || values.id === null
              ? t('form.successItemCreate', '字典项创建成功')
              : t('form.successItemUpdate', '字典项更新成功'),
          variant: 'success',
        })
        setCreateOpen(false)
        setEditOpen(false)
        setEditTarget(undefined)
      } catch (submitError) {
        setFormError(
          extractApiErrorMessage(submitError, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [createItemMutation, invalidateItems, t, toast, updateItemMutation],
  )

  /** 删除字典项：叶子节点、风险低，用轻量的 Alert 确认（不要求输入名称）。 */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || deleteTarget.id === undefined || deleteTarget.id === null) return

    setDeleteError(null)
    try {
      await deleteItemMutation.mutateAsync({ path: { id: deleteTarget.id } })
      await invalidateItems()
      toast.add({
        title: t('form.successItemDelete', '字典项删除成功'),
        variant: 'success',
      })
      setDeleteOpen(false)
      setDeleteTarget(undefined)
    } catch (deleteFailure) {
      setDeleteError(
        extractApiErrorMessage(deleteFailure, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteItemMutation, deleteTarget, invalidateItems, t, toast])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...itemColumns,

        // 操作列
        columnHelper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions', '操作')}</span>,
          enableHiding: false,
          meta: {
            sticky: 'right',
            // 操作列吸「行尾」：LTR 靠右、RTL 靠左；对齐用逻辑属性 text-end 跟随同侧
            cellClassName: 'text-end',
          },
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
                <DropdownMenu.Item
                  className="gap-2"
                  onClick={() => {
                    setEditTarget(row.original)
                    setFormError(null)
                    setEditOpen(true)
                  }}
                >
                  <PencilSimple size={16} />
                  <span>{t('rowActions.editItem', '编辑字典')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  className="gap-2"
                  variant="danger"
                  onClick={() => {
                    setDeleteTarget(row.original)
                    setDeleteError(null)
                    setDeleteOpen(true)
                  }}
                >
                  <Trash size={16} />
                  <span>{t('rowActions.deleteItem', '删除字典')}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          ),
        }),
      ]),
    [itemColumns, t],
  )

  const table = useTable({
    features: stockFeatures,
    data: items,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  })

  const isSubmitting = createItemMutation.isPending || updateItemMutation.isPending

  return (
    <div className="flex flex-col gap-4">
      <TableControls
        /*
          状态筛选：接口只接受 `status` 一个筛选参数（1 / 2），
          一个紧凑的下拉就能表达完，因此紧跟主搜索框放在同一行（主搜索框始终是第一个控件），
          而不是再挂一个 Filters 浮层（字段多、需要区间/多选时才用 `filters`）。
        */
        searchSuffix={
          <Select<StatusFilter>
            aria-label={t('columns.status', '状态')}
            size="base"
            value={statusFilter}
            onValueChange={(next) => {
              setStatusFilter(next ?? 'all')
              setPage(1)
            }}
            items={[
              { value: 'all', label: t('statusFilter.all', '全部状态') },
              {
                value: DICT_STATUS.enabled as StatusFilter,
                label: t('status.enabled', '启用'),
              },
              {
                value: DICT_STATUS.disabled as StatusFilter,
                label: t('status.disabled', '禁用'),
              },
            ]}
          />
        }
        search={{
          placeholder: t('searchItemPlaceholder', '搜索字典项名称 / 键值…'),
          ariaLabel: t('table.search.ariaLabel', {
            ns: 'common',
            defaultValue: '搜索',
          }),
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
            void refetch()
          },
          refreshLoading: isFetching,
          afterRefresh: (
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              onClick={() => {
                setFormError(null)
                setCreateOpen(true)
              }}
            >
              {t('actions.addItem', '新增字典')}
            </Button>
          ),
        }}
      />

      <DataTable
        table={table}
        loading={isPending}
        error={errorMsg}
        onRetry={() => {
          void refetch()
        }}
        moduleName={t('sections.items', '字典项')}
        quotaText={
          <Trans
            i18nKey="quota"
            ns="dataDict"
            defaults="共 <b>{{total}}</b> 项"
            values={{ total }}
            components={{
              b: <b className="font-semibold text-kumo-default tabular-nums" />,
            }}
          />
        }
        emptyTitle={t('empty.itemTitle', '暂无字典项')}
        emptyDescription={t(
          'empty.itemDescription',
          '该分类下还没有字典项，可用「新增字典」继续创建',
        )}
        emptyIcon={<ListBulletsIcon size={44} className="text-kumo-inactive" />}
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

      {/* 新建字典项 */}
      <DictItemFormDialog
        key={`create-${createOpen ? 'open' : 'closed'}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        typeId={typeId}
        typeName={typeName}
        formId="data-dict-item-create-form"
        title={t('form.createItemTitle', '新增字典项')}
        description={t('form.createItemDescription', '在当前分类下新增一个键值对')}
        submitLabel={t('form.submitCreateItem', '创建字典项')}
        submitting={isSubmitting}
        submitError={formError}
        onSubmit={(values) => {
          void handleSubmit(values)
        }}
      />

      {/* 编辑字典项：显式回传原 `type_id`，避免后端把项挂到别处 */}
      <DictItemFormDialog
        key={`edit-${editOpen ? (editTarget?.id ?? 'none') : 'closed'}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        typeId={typeId}
        typeName={typeName}
        initialValues={editTarget}
        formId="data-dict-item-edit-form"
        title={t('form.editItemTitle', '编辑字典项')}
        description={t('form.editItemDescription', '修改该字典项的显示名、键值与状态')}
        submitLabel={t('form.save', '保存')}
        submitting={isSubmitting}
        submitError={formError}
        onSubmit={(values) => {
          void handleSubmit(values)
        }}
      />

      {/* 删除字典项：叶子节点，轻量确认即可 */}
      <LayerDialog.Alert open={deleteOpen} onOpenChange={setDeleteOpen}>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>
            {t('itemDialog.deleteTitle', '删除字典项')}
          </LayerDialog.Title>
          <LayerDialog.Description>
            {t('itemDialog.deleteConfirm', '确定要删除「{{name}}」吗？该操作不可撤销。', {
              name: deleteTarget?.label ?? '',
            })}
          </LayerDialog.Description>

          <LayerDialog.Body>
            {deleteError ? (
              <p className="text-sm text-kumo-danger" role="alert">
                {deleteError}
              </p>
            ) : null}
          </LayerDialog.Body>

          <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              loading={deleteItemMutation.isPending}
              onClick={() => {
                void handleDeleteConfirm()
              }}
            >
              {t('itemDialog.delete', '删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </div>
  )
}
