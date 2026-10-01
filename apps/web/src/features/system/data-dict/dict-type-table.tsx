import {
  Button,
  DropdownMenu,
  useKumoToastManager,
} from '@cloudflare/kumo'
import { DotsThree, FolderPlusIcon, ListDashesIcon, PencilSimple, Trash } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deleteDataDictTypeByIdMutation,
  postDataDictTypeMutation,
} from '#/api'
import {
  DataTable,
  createColumnHelper,
  treeTableFeatures,
  useTable,
  useTreeSearchExpanded,
} from '#/components/data-table'
import type {
  ColumnVisibilityState,
  ExpandedState,
  StockFeatures,
} from '#/components/data-table'
import { useAppTableState } from '#/lib/store'
import { DangerConfirmDialog } from '#/components/danger-confirm-dialog'
import { TableControls } from '#/components/table-controls'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { useHasPermission } from '#/lib/permissions'
import { countTreeNodes } from '#/lib/tree-search'
import {
  DICT_TYPE_DEFAULT_HIDDEN_COLUMNS,
  useDictTypeColumns,
} from './data-dict-columns'
import {
  DEFAULT_PAGE_SIZE,
  DICT_TYPE_ROW_ID,
  DICT_TYPE_SUB_ROWS,
  dictTypeChildren,
  dictTypeLabel,
  filterDictTypeTree,
  findDictType,
} from './data-dict-options'
import type { DictType, DictTypeFormValues } from './data-dict-types'
import { useDictItems, useInvalidateDictItems } from './use-dict-items'
import { useInvalidateDictTypeTree } from './use-dict-type-tree'
import { DictTypeFormDialog } from './dict-type-form-dialog'

const columnHelper = createColumnHelper<StockFeatures, DictType>()

/**
 * 分类树表（根视图与详情页的「子分类」卡片共用）。
 *
 * 树形能力来自 `treeTableFeatures` + `getSubRows`，层级缩进与展开控件由 `DataTable`
 * 由 `DataTable` 的第一列渲染（页面不要自己画缩进）。树表**不开放列排序**
 * （排序会打乱父子层级）。
 *
 * 删除的前端拦截（按约定不等后端报错）分两步：
 * 1. 有直接子分类（本地树上就能看到 `children`）→ 直接 toast 提示，不弹窗；
 * 2. 没有子分类但有字典项 → 弹窗打开后用 `GET /data_dict?type_id=&page_size=1` 查一次
 *    （只需要 `total`），非 0 就把确认按钮与提示锁住。
 *    第二步是必要的：列表接口**不返回字典项数量**，只看本地树会把「有项的叶子分类」放过去。
 */

interface DictTypeTableProps {
  /** 当前层级要展示的分类节点数组（根视图传整棵树）。 */
  nodes: DictType[]
  /**
   * 本层级的父级 id：新建分类（含卡片头部/工具条的入口）默认挂在它下面。
   *
   * - 列表页传 `DICT_ROOT_TYPE_ID`（67）—— 模块可见的最顶层就是它的直接子分类；
   * - 详情页的「子分类」卡片传当前分类 id，使「新增子分类」落在当前分类下。
   */
  rootParentId: number
  /** 根视图的父级名称（用于「将创建在：」提示）。 */
  rootParentName?: string
  /** 是否渲染搜索 / 刷新控制栏与分页（详情页的「子分类」卡片传 false）。 */
  showControls?: boolean
  /** 展开状态是否受控（详情页由页面统一管理）。 */
  expanded?: ExpandedState
  onExpandedChange?: (next: ExpandedState) => void
  /**
   * 卡片头部标题（「简洁表格」形态）。
   *
   * 只在**不渲染 `TableControls`、由调用方在页头自带新增入口**的场景使用
   * （详情页的「子分类」卡片）：本组件不再自带头部按钮，避免同一页出现两个同类入口。
   */
  headerTitle?: ReactNode
  /**
   * 统计文案插槽。
   *
   * 传函数形态时，参数是**过滤结果树的节点总数**（含所有层级）—— 树表默认折叠但可展开，
   * 只数顶层会让「共 N 项」与展开后的行数对不上；搜索时该值也随之变化。
   */
  quotaText?: ReactNode | ((total: number) => ReactNode)
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function DictTypeTable({
  nodes,
  rootParentId,
  rootParentName,
  showControls = true,
  expanded,
  onExpandedChange,
  headerTitle,
  quotaText,
  loading = false,
  error = null,
  onRetry,
}: DictTypeTableProps) {
  const { t } = useTranslation('dataDict')
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const toast = useKumoToastManager()

  const invalidateTypeTree = useInvalidateDictTypeTree()
  const invalidateItems = useInvalidateDictItems()
  const createTypeMutation = useMutation(postDataDictTypeMutation())
  const deleteTypeMutation = useMutation(deleteDataDictTypeByIdMutation())

  // 搜索：接口无关键词参数，过滤在前端完成（过滤时保留命中节点的祖先链）
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const [page, setPage] = useAppTableState<number>('system/data-dict/type', 'page', 1)
  const [pageSize, setPageSize] = useAppTableState<number>('system/data-dict/type', 'pageSize', DEFAULT_PAGE_SIZE)

  // 列设置按应用隔离持久化：同一张表在 Console / Analytics 下各存一份
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'system/data-dict/type',
    'columnVisibility',
    () => Object.fromEntries(DICT_TYPE_DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  // 弹窗状态
  /**
   * 新建分类的父级 id；`undefined` 表示「顶层入口」——提交时回落到 `rootParentId`
   * （列表页 = 字典根分类 67；详情页的「子分类」卡片 = 当前分类）。
   */
  const [createParentId, setCreateParentId] = useState<number | undefined>()
  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DictType | undefined>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /** 删除前的字典项检查：只在弹窗打开时发起。 */
  const deleteCheck = useDictItems({
    typeId: deleteTarget?.id,
    page: 1,
    pageSize: 1,
    enabled: Boolean(deleteTarget),
  })

  const filteredNodes = useMemo(() => filterDictTypeTree(nodes, keyword), [nodes, keyword])

  /** 「共 N 项」的口径：**过滤结果树的节点总数**（含所有层级），与展开后的行数一致 */
  const quotaTotal = useMemo(
    () => countTreeNodes(filteredNodes, DICT_TYPE_SUB_ROWS),
    [filteredNodes],
  )

  /**
   * 展开态：**默认折叠 → 搜索时展开过滤结果 → 清空关键词回落折叠**。
   * 交互细节统一在 `useTreeSearchExpanded`（功能树的容器视图共用同一套逻辑）。
   */
  const treeSearch = useTreeSearchExpanded<DictType>({
    filteredNodes,
    keyword,
    getSubRows: DICT_TYPE_SUB_ROWS,
    getRowId: DICT_TYPE_ROW_ID,
    controlledExpanded: expanded,
    onControlledExpandedChange: onExpandedChange,
  })

  const pagedNodes = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredNodes.slice(start, start + pageSize)
  }, [filteredNodes, page, pageSize])

  /** 下钻到分类详情页（分类树表在各处都用于「进入该分类」）。 */
  const openType = useCallback(
    (node: DictType) => {
      if (node.id === undefined || node.id === null) return
      navigate({
        to: '/$appId/system/data-dict/$typeId',
        params: { appId, typeId: String(node.id) },
      })
    },
    [appId, navigate],
  )

  const typeColumns = useDictTypeColumns({ onOpenType: openType })

  /** 分类写入：有 `id` 走 PUT，否则走 POST（两端点请求体结构一致）。 */
  /**
   * 新建分类（列表页两个入口共用）：父级由入口决定 ——
   * 工具条「新增分类」= `rootParentId`，行内菜单「新增子分类」= 该行节点。
   *
   * **编辑不在这里**：分类的修改统一在详情页的内嵌表单里完成，
   * 行内菜单的「编辑分类」只是导航到详情页。
   */
  const handleSubmit = useCallback(
    async (values: DictTypeFormValues) => {
      setFormError(null)
      try {
        await createTypeMutation.mutateAsync({
          body: {
            name: values.name,
            code: values.code,
            type: values.type,
            status: values.status,
            // 按入口决定父级（子分类 = 该节点，顶级 = `rootParentId`）
            parent_id: createParentId ?? rootParentId,
            sort: values.sort,
            remark: values.remark,
          },
        })

        await invalidateTypeTree()
        toast.add({
          title: t('form.successTypeCreate', '分类创建成功'),
          variant: 'success',
        })
        setCreateOpen(false)
        setCreateParentId(undefined)
      } catch (submitError) {
        setFormError(
          extractApiErrorMessage(submitError, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [createParentId, createTypeMutation, invalidateTypeTree, rootParentId, t, toast],
  )

  /** 点击删除：先拦「有子分类」，再看字典项（弹窗内拦）。 */
  const handleDeleteClick = useCallback(
    (node: DictType) => {
      const childCount = dictTypeChildren(node).length
      if (childCount > 0) {
        toast.add({
          title: t(
            'messages.deleteBlocked',
            '该分类下还有 {{total}} 个子分类，请先删除子分类',
            { total: childCount },
          ),
          variant: 'warning',
        })
        return
      }

      setDeleteTarget(node)
      setDeleteError(null)
      setDeleteOpen(true)
    },
    [t, toast],
  )

  /** 删除分类：成功后分类树与字典项列表一并失效。 */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || deleteTarget.id === undefined || deleteTarget.id === null) return

    setDeleteError(null)
    try {
      await deleteTypeMutation.mutateAsync({ path: { id: deleteTarget.id } })
      await Promise.all([invalidateTypeTree(), invalidateItems()])
      toast.add({
        title: t('form.successTypeDelete', '分类删除成功'),
        variant: 'success',
      })
      setDeleteOpen(false)
      setDeleteTarget(undefined)
    } catch (deleteFailure) {
      setDeleteError(
        extractApiErrorMessage(deleteFailure, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteTarget, deleteTypeMutation, invalidateItems, invalidateTypeTree, t, toast])

  /*
    按钮级权限收口：三个操作各自绑定权限点，判定走 `useHasPermission`
    （→ `hasPermission` → 权限 store），与侧边栏、路由守卫、AI 能力过滤
    用的是**同一套**判定 —— 这里不再另写 `if (role === ...)`。
  */
  const canCreate = useHasPermission('dict:create')
  const canEdit = useHasPermission('dict:edit')
  const canDelete = useHasPermission('dict:delete')
  const canOperate = canCreate || canEdit || canDelete

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...typeColumns,

        // 操作列：一项操作都没有权限时整列不渲染 —— 空菜单比没有菜单更糟
        ...(canOperate
          ? [
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
                      {canCreate ? (
                        <DropdownMenu.Item
                          className="gap-2"
                          onClick={() => {
                            setCreateParentId(row.original.id)
                            setFormError(null)
                            setCreateOpen(true)
                          }}
                        >
                          <FolderPlusIcon size={16} />
                          <span>{t('rowActions.addChildType', '新增子分类')}</span>
                        </DropdownMenu.Item>
                      ) : null}
                      {canEdit ? (
                        <DropdownMenu.Item
                          className="gap-2"
                          onClick={() => openType(row.original)}
                        >
                          <PencilSimple size={16} />
                          <span>{t('rowActions.editType', '编辑分类')}</span>
                        </DropdownMenu.Item>
                      ) : null}
                      {canDelete ? (
                        <>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item
                            className="gap-2"
                            variant="danger"
                            onClick={() => handleDeleteClick(row.original)}
                          >
                            <Trash size={16} />
                            <span>{t('rowActions.deleteType', '删除分类')}</span>
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
    [canCreate, canDelete, canEdit, canOperate, handleDeleteClick, openType, t, typeColumns],
  )

  const table = useTable({
    features: treeTableFeatures,
    data: pagedNodes,
    columns,
    state: { columnVisibility, expanded: treeSearch.expanded },
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: treeSearch.onExpandedChange,
    // 行 id / 子节点访问器与过滤、展开共用同一份模块级常量（引用稳定），刷新后展开态稳定
    getRowId: DICT_TYPE_ROW_ID,
    getSubRows: DICT_TYPE_SUB_ROWS,
  })

  const isSubmitting = createTypeMutation.isPending
  const dictItemCount = deleteCheck.total
  const blockedByItems = Boolean(deleteTarget) && dictItemCount > 0

  return (
    <div className="flex flex-col gap-4">
      {showControls ? (
        <TableControls
          search={{
            placeholder: t('searchTypePlaceholder', '搜索分类名称 / 编码…'),
            // 本页默认命名空间是 dataDict，而 table 是 common 下的根键，
            // 因此必须显式指定 ns，否则其它语言会回落到中文 defaultValue
            ariaLabel: t('table.search.ariaLabel', {
              ns: 'common',
              defaultValue: '搜索',
            }),
            value: searchInput,
            onChange: (value) => {
              setSearchInput(value)
              setKeyword(value)
              setPage(1)
            },
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
            onRefresh: onRetry,
            refreshLoading: loading,
            // 无 `dict:create` 权限时不渲染入口（与行内菜单、路由守卫同一套判定）
            extra: canCreate ? (
              <Button
                variant="primary"
                icon={<FolderPlusIcon size={16} />}
                onClick={() => {
                  // 顶层入口：新建的分类挂在 `rootParentId` 下
                  // （列表页 = 字典根分类 67；详情页的「子分类」卡片 = 当前分类）
                  setCreateParentId(undefined)
                  setFormError(null)
                  setCreateOpen(true)
                }}
              >
                {t('actions.addTopType', '新增分类')}
              </Button>
            ) : undefined,
          }}
        />
      ) : null}

      <DataTable
        table={table}
        loading={loading}
        error={error}
        onRetry={onRetry}
        moduleName={t('moduleName', '数据字典')}
        headerTitle={headerTitle}
        quotaText={
          typeof quotaText === 'function' ? quotaText(quotaTotal) : quotaText
        }
        emptyTitle={t('empty.typeTitle', '暂无分类数据')}
        emptyDescription={t(
          'empty.typeDescription',
          '未找到符合条件的分类，请尝试更换关键词',
        )}
        emptyIcon={<ListDashesIcon size={44} className="text-kumo-inactive" />}
        tree
        pagination={
          showControls
            ? {
                page,
                pageSize,
                total: filteredNodes.length,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size)
                  setPage(1)
                },
              }
            : undefined
        }
      />

      {/* 新建分类：`key` 让每次打开都重建初值 */}
      <DictTypeFormDialog
        key={`create-${createOpen ? (createParentId ?? 'root') : 'closed'}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        formId="data-dict-type-create-form"
        parentName={
          createParentId === undefined
            ? rootParentName
            : (findDictType(nodes, createParentId)?.name ?? String(createParentId))
        }
        title={
          createParentId === undefined
            ? t('form.createTypeTitle', '新增分类')
            : t('form.createChildTypeTitle', '新增子分类')
        }
        description={
          createParentId === undefined
            ? t('form.createTypeDescription', '创建一个数据字典分类，用来归类一组键值')
            : t('form.createChildTypeDescription', '在当前分类下创建子分类')
        }
        submitLabel={
          createParentId === undefined
            ? t('form.submitCreateType', '创建分类')
            : t('form.submitCreateChildType', '创建子分类')
        }
        submitting={isSubmitting}
        submitError={formError}
        onSubmit={(values) => {
          void handleSubmit(values)
        }}
      />

      {/* 删除分类：有字典项时锁住确认按钮并就地说明原因 */}
      <DangerConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteTarget(undefined)
            setDeleteError(null)
          }
        }}
        title={t('detail.deleteTypeTitle', '删除分类')}
        description={
          <Trans
            i18nKey="detail.deleteTypeConfirm"
            ns="dataDict"
            defaults="该操作不可撤销。将永久删除分类 <b>{{name}}</b> 及其在树中的位置。"
            values={{ name: deleteTarget ? dictTypeLabel(deleteTarget) : '' }}
            components={{ b: <b className="font-medium text-kumo-default" /> }}
          />
        }
        confirmationText={deleteTarget ? dictTypeLabel(deleteTarget) : ''}
        confirmLabel={t('detail.deleteType', '删除分类')}
        loading={deleteTypeMutation.isPending}
        errorMessage={
          blockedByItems
            ? t(
                'messages.deleteBlockedByItems',
                '该分类下还有 {{total}} 个字典项，请先删除字典项',
                { total: dictItemCount },
              )
            : deleteError
        }
        onConfirm={() => {
          void handleDeleteConfirm()
        }}
      />
    </div>
  )
}
