import {
  Button,
  DropdownMenu,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  DotsThree,
  ListDashesIcon,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deleteSystemMenuByIdMutation,
  putSystemMenuMutation,
} from '#/api'
import type { MenuNode } from '#/api'
import {
  DataTable,
  createColumnHelper,
  treeTableFeatures,
  useTable,
  useTreeSearchExpanded,
} from '#/components/data-table'
import type { ColumnVisibilityState, StockFeatures } from '#/components/data-table'
import { useAppTableState } from '#/lib/store'
import { DangerConfirmDialog } from '#/components/danger-confirm-dialog'
import { PageHeader } from '#/components/page-header'
import { TableControls } from '#/components/table-controls'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { countTreeNodes, filterTreeByMatch } from '#/lib/tree-search'
import {
  FEATURE_DEFAULT_HIDDEN_COLUMNS,
  useFeatureColumns,
} from '../-data/feature-columns'
import {
  MENU_PLACEHOLDER_COMPONENT,
  MENU_PLACEHOLDER_PATH,
  MENU_ROOT_ID,
  MENU_ROW_ID,
  MENU_SUB_ROWS,
  matchesMenuKeyword,
  menuChildren,
  menuIsGroup,
  menuIsNavigable,
} from '../-data/feature-options'
import { useFeatureBreadcrumbTrail } from '../-data/feature-breadcrumb'
import {
  useFeaturesTree,
  useInvalidateFeaturesTree,
} from '../-data/use-features-tree'
import { FeatureCreateActions } from './feature-create-actions'
import { FeatureFormDialog } from './feature-form-dialog'
import type { FeatureFormValues } from './feature-form'

/**
 * 功能容器视图（根视图与功能组视图共用）。
 *
 * 数据来自 `useFeaturesTree()` 的整棵新架构功能树：
 * - 根视图（`node` 缺省）展示 `MENU_ROOT_ID`（482）的直接子节点；
 * - 功能组视图（`node` 为该功能组）展示它的 `children`，可继续嵌套。
 *
 * 「功能组没有详情页」这条规则就体现在这里：功能组落在同一个容器视图上，
 * 只有功能（`menu_type=2`）才会被路由层分流到详情视图。
 *
 * 页头右侧承载「当前容器自身」的编辑 / 删除（仅功能组视图有 `node`，根视图 482 不提供）：
 * - 编辑：`LayerDialog` + 复用的 `FeatureForm`（`variant="group"`，不出权限标识与绑定接口）；
 * - 删除：有子项时只提示，空的功能组才走 `DangerConfirmDialog`（输入组名确认）。
 *
 * 创建入口是分裂按钮：主按钮「添加功能」，下拉里是「添加功能组」。
 */

/** 默认每页条数（与用户列表保持一致）。 */
const DEFAULT_PAGE_SIZE = 15

const columnHelper = createColumnHelper<StockFeatures, MenuNode>()

interface FeatureContainerProps {
  /** 当前容器节点；根视图不传（代表 `MENU_ROOT_ID` 根层级）。 */
  node?: MenuNode
}

export function FeatureContainer({ node }: FeatureContainerProps) {
  const { t } = useTranslation('features')
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const toast = useKumoToastManager()

  const { nodes, isDemoMode, isPending, isFetching, error, refetch } = useFeaturesTree()

  // 把当前层级注册给顶栏面包屑（详情页返回所属功能组的入口即来自这里）
  useFeatureBreadcrumbTrail(nodes, appId)

  const containerId = node?.menu_id ?? MENU_ROOT_ID
  const containerName = node?.menu_name || t('title', '功能')
  /** 根视图取全树的根子节点，功能组视图取该功能组的直接子项。 */
  const containerRows = useMemo(
    () => (node ? menuChildren(node) : nodes),
    [node, nodes],
  )

  /**
   * 当前容器自身的编辑 / 删除（仅功能组视图）。
   * 复用 `PUT` / `DELETE /system/menu`，与功能详情页同一套接口。
   */
  const invalidateFeaturesTree = useInvalidateFeaturesTree()
  const updateGroupMutation = useMutation(putSystemMenuMutation())
  const deleteGroupMutation = useMutation(deleteSystemMenuByIdMutation())

  const [editOpen, setEditOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /**
   * 行内删除：目标是被操作的那一行，与页头「删除当前功能组」（目标是 `node` 自身）
   * 是两个独立目标，因此各自一份 state 与 mutation（互不干扰，弹窗也不会串）。
   */
  const deleteRowMutation = useMutation(deleteSystemMenuByIdMutation())
  const [deleteRowOpen, setDeleteRowOpen] = useState(false)
  const [deleteRowTarget, setDeleteRowTarget] = useState<MenuNode | null>(null)
  const [deleteRowError, setDeleteRowError] = useState<string | null>(null)

  // 搜索：接口无关键词参数，过滤在前端完成
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  // 分页：当前为客户端切片
  const [page, setPage] = useAppTableState<number>('system/features', 'page', 1)
  const [pageSize, setPageSize] = useAppTableState<number>('system/features', 'pageSize', DEFAULT_PAGE_SIZE)

  // 列设置按应用隔离持久化：同一张表在 Console / Analytics 下各存一份
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'system/features',
    'columnVisibility',
    () => Object.fromEntries(FEATURE_DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  // 下钻 / 返回会复用同一个组件实例，切换容器时清空搜索与页码，避免带着上一个层级的筛选
  useEffect(() => {
    setSearchInput('')
    setKeyword('')
    setPage(1)
  }, [containerId])

  const errorMsg = error
    ? ((error as { message?: string } | null)?.message ??
      t('messages.fetchFailed', '获取功能列表失败'))
    : null

  /**
   * 本地搜索（接口没有关键词参数）：**只保留命中节点 + 其祖先链** ——
   * 命中功能组时带着它命中的下级一起展示，未命中的分支整支剪掉
   * （通用规则见 `#/lib/tree-search` 的 `filterTreeByMatch`）。
   */
  const filteredRows = useMemo(
    () =>
      keyword.trim()
        ? filterTreeByMatch(
            containerRows,
            (row) => matchesMenuKeyword(row, keyword),
            {
              getSubRows: MENU_SUB_ROWS,
              withChildren: (row, children) => ({ ...row, children }),
            },
          )
        : containerRows,
    [containerRows, keyword],
  )

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  // 搜索 / 刷新后总页数可能变小，把越界页码收敛回最后一页，避免停留在空白页
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRows.length / pageSize))
    if (page > maxPage) setPage(maxPage)
  }, [filteredRows.length, page, pageSize])

  /** 回到上一级：父级是根层级（或没有父）时回功能列表，否则回父节点视图。 */
  const goToParent = useCallback(() => {
    const parentId = node?.parent_id
    if (
      parentId === undefined ||
      parentId === null ||
      parentId === 0 ||
      parentId === MENU_ROOT_ID
    ) {
      navigate({ to: '/$appId/system/features', params: { appId } })
      return
    }
    navigate({
      to: '/$appId/system/features/$featureId',
      params: { appId, featureId: String(parentId) },
    })
  }, [appId, navigate, node?.parent_id])

  /** 保存功能组自身（名称 / 图标 / 排序 / 启用 / 显示）。 */
  const handleGroupSubmit = useCallback(
    async (values: FeatureFormValues) => {
      if (!node || node.menu_id === undefined || node.menu_id === null) return

      setFormError(null)
      try {
        await updateGroupMutation.mutateAsync({
          body: {
            menu_id: node.menu_id,
            menu_name: values.menu_name,
            icon: values.icon,
            sort: values.sort,
            status: values.status,
            visible: values.visible,
            // 显式回传原上级，避免后端把缺失的 parent_id 当成根层级而把功能组移走
            parent_id: node.parent_id,
            component: MENU_PLACEHOLDER_COMPONENT,
            path: MENU_PLACEHOLDER_PATH,
          },
        })
        await invalidateFeaturesTree()
        toast.add({
          title: t('form.successGroupUpdate', '功能组更新成功'),
          variant: 'success',
        })
        setEditOpen(false)
      } catch (error) {
        setFormError(
          extractApiErrorMessage(error, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [invalidateFeaturesTree, node, t, toast, updateGroupMutation],
  )

  /**
   * 打开删除功能组的确认弹窗；**有子项的功能组先不允许删除**（直接提示，不等后端报错）。
   */
  const handleDeleteGroupClick = useCallback(() => {
    if (containerRows.length > 0) {
      toast.add({
        title: t(
          'detail.deleteBlocked',
          '该节点下还有 {{total}} 个子项，请先删除子项',
          { total: containerRows.length },
        ),
        variant: 'warning',
      })
      return
    }
    setDeleteError(null)
    setDeleteOpen(true)
  }, [containerRows.length, t, toast])

  /** 删除功能组：成功后整棵树失效并回到上一级。 */
  const handleDeleteGroupConfirm = useCallback(async () => {
    if (!node || node.menu_id === undefined || node.menu_id === null) return

    setDeleteError(null)
    try {
      await deleteGroupMutation.mutateAsync({ path: { id: node.menu_id } })
      await invalidateFeaturesTree()
      toast.add({
        title: t('form.successGroupDelete', '功能组删除成功'),
        variant: 'success',
      })
      setDeleteOpen(false)
      goToParent()
    } catch (error) {
      setDeleteError(
        extractApiErrorMessage(error, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteGroupMutation, goToParent, invalidateFeaturesTree, node, t, toast])

  /** 清空搜索框与生效关键词，并回到第一页 */
  const clearSearch = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setPage(1)
  }, [])

  /**
   * 进入某个节点：功能组与功能共用同一条动态路由，由路由层按 `menu_type` 分流；
   * 操作（`menu_type=3`）本轮没有落点视图，点击不生效（名称也不渲染成按钮）。
   */
  const openNode = useCallback(
    (target: MenuNode) => {
      if (!menuIsNavigable(target) || target.menu_id === undefined || target.menu_id === null) {
        return
      }
      navigate({
        to: '/$appId/system/features/$featureId',
        params: { appId, featureId: String(target.menu_id) },
      })
    },
    [appId, navigate],
  )

  /**
   * 行内删除：与页头的删除同一套前置拦截 —— **有子项直接提示**（`detail.deleteBlocked`），
   * 不等后端报错；通过后才打开必须输入名称的确认弹窗。
   */
  const handleDeleteRowClick = useCallback(
    (target: MenuNode) => {
      const childCount = menuChildren(target).length
      if (childCount > 0) {
        toast.add({
          title: t(
            'detail.deleteBlocked',
            '该节点下还有 {{total}} 个子项，请先删除子项',
            { total: childCount },
          ),
          variant: 'warning',
        })
        return
      }
      setDeleteRowError(null)
      setDeleteRowTarget(target)
      setDeleteRowOpen(true)
    },
    [t, toast],
  )

  /**
   * 删除行内节点：成功后失效整棵树即可，**留在当前页**（不像页头删除当前功能组那样回到上一级，
   * 因为被删的不是当前容器）。
   */
  const handleDeleteRowConfirm = useCallback(async () => {
    const targetId = deleteRowTarget?.menu_id
    if (targetId === undefined || targetId === null) return

    setDeleteRowError(null)
    try {
      await deleteRowMutation.mutateAsync({ path: { id: targetId } })
      await invalidateFeaturesTree()
      toast.add({
        title: menuIsGroup(deleteRowTarget)
          ? t('form.successGroupDelete', '功能组删除成功')
          : t('form.successFeatureDelete', '功能删除成功'),
        variant: 'success',
      })
      setDeleteRowOpen(false)
    } catch (error) {
      setDeleteRowError(
        extractApiErrorMessage(error, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteRowMutation, deleteRowTarget, invalidateFeaturesTree, t, toast])

  const featureColumns = useFeatureColumns({ onOpenNode: openNode })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...featureColumns,

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
                {/*
                  只有一个编辑入口：功能组进容器视图、功能进详情视图，都在那边完成实际编辑，
                  不再单独提供「查看详情」（它和编辑其实是同一个去处）。
                  操作（menu_type=3）没有落点视图，因此不出这一项。
                */}
                {menuIsNavigable(row.original) ? (
                  <DropdownMenu.Item
                    className="gap-2"
                    onClick={() => openNode(row.original)}
                  >
                    <PencilSimple size={16} />
                    <span>
                      {menuIsGroup(row.original)
                        ? t('rowActions.editGroup', '编辑功能组')
                        : t('rowActions.editFeature', '编辑功能')}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  className="gap-2"
                  variant="danger"
                  onClick={() => handleDeleteRowClick(row.original)}
                >
                  <Trash size={16} />
                  <span>{t('rowActions.delete', '删除')}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          ),
        }),
      ]),
    [featureColumns, handleDeleteRowClick, openNode, t],
  )

  /**
   * 展开态：**默认折叠 → 搜索时展开过滤结果 → 清空关键词回落折叠**
   * （与数据字典分类树共用同一套通用逻辑）。
   */
  const treeSearch = useTreeSearchExpanded<MenuNode>({
    filteredNodes: filteredRows,
    keyword,
    getSubRows: MENU_SUB_ROWS,
    getRowId: MENU_ROW_ID,
  })

  const table = useTable({
    features: treeTableFeatures,
    data: pagedRows,
    columns,
    state: { columnVisibility, expanded: treeSearch.expanded },
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: treeSearch.onExpandedChange,
    // 行 id 用业务主键，刷新后展开态稳定；与过滤、展开共用同一份访问器
    getRowId: MENU_ROW_ID,
    getSubRows: MENU_SUB_ROWS,
  })

  /**
   * 行内删除的目标类型：容器视图里的行只可能是功能组（1）或功能（2）
   * —— 权限（3）挂在功能下，只会出现在功能详情页的权限子表里。
   */
  const deleteRowIsGroup = menuIsGroup(deleteRowTarget)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={containerName}
        description={
          node
            ? t('containerDescription', '该功能组下的内容，可继续嵌套功能组或添加功能')
            : t('description', '维护功能层级与权限编码，功能组用于分层，功能是最小交付单元')
        }
        actions={
          // 根视图（482）自身不在接口返回的树里，因此只对功能组提供编辑 / 删除
          node ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                icon={<PencilSimple size={16} />}
                onClick={() => {
                  setFormError(null)
                  setEditOpen(true)
                }}
              >
                {t('rowActions.edit', '编辑')}
              </Button>
              <Button
                variant="destructive"
                icon={<Trash size={16} />}
                onClick={handleDeleteGroupClick}
              >
                {t('rowActions.delete', '删除')}
              </Button>
            </div>
          ) : undefined
        }
      />

      <TableControls
        search={{
          placeholder: t('searchPlaceholder', '搜索功能名称 / 权限编码…'),
          // 本页默认命名空间是 features，而 table 是 common 下的根键，
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
          onClear: clearSearch,
        }}
        table={table}
        actions={{
          onRefresh: () => {
            void refetch()
          },
          refreshLoading: isFetching,
          extra: <FeatureCreateActions parentId={containerId} />,
        }}
      />

      <DataTable
        table={table}
        // 树列 = 名称列：功能组可展开出下级；功能 / 权限没有下级，自然不出现展开控件
        tree
        loading={isPending}
        error={errorMsg}
        onRetry={() => {
          void refetch()
        }}
        moduleName={t('moduleName', '功能')}
        quotaText={
          <Trans
            i18nKey="quota"
            ns="features"
            defaults="共 <b>{{total}}</b> 项"
            values={{ total: countTreeNodes(filteredRows, MENU_SUB_ROWS) }}
            components={{
              b: <b className="font-semibold text-kumo-default tabular-nums" />,
            }}
          />
        }
        extraStatus={
          isDemoMode ? (
            <span className="ms-2 font-medium text-amber-500">
              {t('demoBadge', '（演示数据模式）')}
            </span>
          ) : null
        }
        emptyTitle={t('empty.title', '暂无功能数据')}
        emptyDescription={t(
          'empty.description',
          '未找到符合条件的功能，请尝试更换关键词',
        )}
        emptyIcon={<ListDashesIcon size={44} className="text-kumo-inactive" />}
        pagination={{
          page,
          pageSize,
          total: filteredRows.length,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />

      {/* 编辑当前功能组：复用同一套表单（variant=group 不出权限标识与绑定接口） */}
      <FeatureFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        variant="group"
        target={node}
        formId="feature-group-form"
        title={t('detail.editGroup', '编辑功能组')}
        description={t(
          'detail.editGroupDescription',
          '修改功能组的名称、图标、排序与显示状态',
        )}
        submitLabel={t('form.save', '保存')}
        submitting={updateGroupMutation.isPending}
        submitError={formError}
        onSubmit={(values) => {
          void handleGroupSubmit(values)
        }}
      />

      {/* 删除当前功能组：必须输入组名才能确认 */}
      <DangerConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('detail.deleteGroup', '删除功能组')}
        description={
          <Trans
            i18nKey="detail.deleteGroupConfirm"
            ns="features"
            defaults="该操作不可撤销。将永久删除功能组 <b>{{name}}</b>。"
            values={{ name: node?.menu_name ?? '' }}
            components={{ b: <b className="font-medium text-kumo-default" /> }}
          />
        }
        confirmationText={node?.menu_name ?? ''}
        confirmLabel={t('detail.deleteGroup', '删除功能组')}
        loading={deleteGroupMutation.isPending}
        errorMessage={deleteError}
        onConfirm={() => {
          void handleDeleteGroupConfirm()
        }}
      />

      {/* 行内删除：功能组 / 功能各用对应文案，同样要求输入名称才能确认 */}
      <DangerConfirmDialog
        open={deleteRowOpen}
        onOpenChange={setDeleteRowOpen}
        title={
          deleteRowIsGroup
            ? t('detail.deleteGroup', '删除功能组')
            : t('detail.deleteFeature', '删除功能')
        }
        description={
          deleteRowIsGroup ? (
            <Trans
              i18nKey="detail.deleteGroupConfirm"
              ns="features"
              defaults="该操作不可撤销。将永久删除功能组 <b>{{name}}</b>。"
              values={{ name: deleteRowTarget?.menu_name ?? '' }}
              components={{ b: <b className="font-medium text-kumo-default" /> }}
            />
          ) : (
            <Trans
              i18nKey="detail.deleteFeatureConfirm"
              ns="features"
              defaults="该操作不可撤销。将永久删除功能 <b>{{name}}</b>，以及它在功能树中的位置。"
              values={{ name: deleteRowTarget?.menu_name ?? '' }}
              components={{ b: <b className="font-medium text-kumo-default" /> }}
            />
          )
        }
        confirmationText={deleteRowTarget?.menu_name ?? ''}
        confirmLabel={
          deleteRowIsGroup
            ? t('detail.deleteGroup', '删除功能组')
            : t('detail.deleteFeature', '删除功能')
        }
        loading={deleteRowMutation.isPending}
        errorMessage={deleteRowError}
        onConfirm={() => {
          void handleDeleteRowConfirm()
        }}
      />
    </div>
  )
}
