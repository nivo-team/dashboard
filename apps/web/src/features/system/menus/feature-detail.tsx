import {
  Button,
  ClipboardText,
  DropdownMenu,
  LayerCard,
  Switch,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  DotsThree,
  PencilSimple,
  PlusIcon,
  Trash,
  TreeStructureIcon,
} from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deleteSystemMenuByIdMutation,
  postSystemMenuMutation,
  putSystemMenuMutation,
} from '#/api'
import type { MenuNode } from '#/api'
import {
  DataTable,
  createColumnHelper,
  stockFeatures,
  useTable,
} from '#/components/data-table'
import type { StockFeatures } from '#/components/data-table'
import { DangerConfirmDialog } from '#/components/danger-confirm-dialog'
import { PageHeader } from '#/components/page-header'
import { UnsavedChangesBar } from '#/components/unsaved-changes-bar'
import { useAiFormSubmit } from '#/lib/ai'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { useHasPermission } from '#/lib/permissions'
import { useTimezone } from '#/lib/format'
import {
  FEATURE_CHILD_COLUMN_SPECS,
  featureIsFrameBadge,
  featureNoCacheBadge,
  featureTypeBadge,
  useFeatureColumns,
} from './feature-columns'
import { useFeatureBreadcrumbTrail } from './feature-breadcrumb'
import {
  MENU_PLACEHOLDER_COMPONENT,
  MENU_ROOT_ID,
  MENU_STATUS,
  MENU_TYPE,
  menuIsNavigable,
  toEpochMs,
  toMenuStatus,
  toMenuVisible,
} from './feature-options'
import {
  useFeaturesTree,
  useInvalidateFeaturesTree,
} from './use-features-tree'
import { FeatureForm, validateFeatureForm } from './feature-form'
import type { FeatureFormValues } from './feature-form'
import { FeatureFormDialog } from './feature-form-dialog'
import { FeaturePermissionDeleteDialog } from './feature-permission-delete-dialog'

/**
 * 功能详情视图（仅 `menu_type=2` 的功能会落到这里；功能组走容器视图）。
 *
 * 布局参照 Clerk 的 feature 详情页：
 * - 左侧主体是**功能自身的可编辑表单**（名称 / 权限标识 / 图标 / 排序 / 状态 / 显示 / 绑定接口），
 *   保存走 `PUT /system/menu`；
 * - 右侧是吸顶（`lg:sticky`）的信息栏：Key（可一键复制）、删除功能、创建时间；
 * - 下方是该功能下的**权限列表**（权限的增删改都在本页弹窗完成，详见各弹窗组件）。
 *
 * 数据仍然来自 `useFeaturesTree()` 的整棵功能树，由路由层定位后以 props 传入。
 */

/** 权限弹窗的编辑目标：`'create'` 表示新建，节点表示编辑，`null` 表示关闭。 */
type PermissionFormTarget = MenuNode | 'create' | null

const columnHelper = createColumnHelper<StockFeatures, MenuNode>()

/** 时间兜底格式化：字符串/数字统一走 toEpochMs，再交给全局时区格式化。 */
function formatMaybeTime(
  value: unknown,
  formatDateTime: (value: number) => string,
): ReactNode {
  const ms = toEpochMs(value)
  return ms === null ? '-' : formatDateTime(ms)
}

/** 侧栏里的一行只读信息（标签在左、值在右）。 */
function SidebarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-kumo-subtle">{label}</span>
      <span className="min-w-0 truncate text-sm font-medium text-kumo-default">
        {children}
      </span>
    </div>
  )
}

/** 表单草稿的规范化：用于「未保存更改」比较（忽略首尾空白与数组顺序）。 */
/**
 * AI 表单桥的表单 id：字段读写（`FeatureForm` 侧）与提交（本页侧）两半靠它拼成一条记录。
 * 同一页面上唯一即可。
 */
const AI_FEATURE_FORM_ID = 'feature-detail'

function normalizeDraft(values?: Partial<FeatureFormValues>): string {
  return JSON.stringify({
    menu_name: (values?.menu_name ?? '').trim(),
    path: (values?.path ?? '').trim(),
    permission: values?.permission ?? '',
    api_keys: [...(values?.api_keys ?? [])].sort(),
    icon: (values?.icon ?? '').trim(),
    sort: values?.sort ?? 0,
    status: values?.status ?? MENU_STATUS.enabled,
    visible: values?.visible ?? 1,
  })
}

interface FeatureDetailProps {
  /** 当前功能节点。 */
  node: MenuNode
}

export function FeatureDetail({ node }: FeatureDetailProps) {
  const { t } = useTranslation('menus')
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const { formatDateTime } = useTimezone()
  const toast = useKumoToastManager()
  const invalidateFeaturesTree = useInvalidateFeaturesTree()

  // 详情视图同样需要整棵树来注册顶栏面包屑层级（与容器视图共享同一份缓存，不会多发请求）
  const { nodes } = useFeaturesTree()
  useFeatureBreadcrumbTrail(nodes, appId)

  const children = useMemo(() => node.children ?? [], [node.children])

  /** 功能自身表单的初始值 */
  const featureInitialValues = useMemo<Partial<FeatureFormValues>>(
    () => ({
      menu_name: node.menu_name,
      path: node.path,
      permission: node.permission,
      api_keys: node.api_keys ?? [],
      icon: node.icon,
      sort: node.sort,
      status: toMenuStatus(node.status),
      visible: toMenuVisible(node.visible),
    }),
    [node],
  )

  const [featureError, setFeatureError] = useState<string | null>(null)
  const updateFeatureMutation = useMutation(putSystemMenuMutation())

  /** 页头右侧的「启用」开关（受控）与表单草稿 */
  const [status, setStatus] = useState<FeatureFormValues['status']>(() =>
    toMenuStatus(node.status),
  )
  const [draft, setDraft] = useState<FeatureFormValues | null>(null)
  /** 递增该值会重建表单，用于「重置」回初始值 */
  const [resetSeq, setResetSeq] = useState(0)

  /** 有草稿且与初始值不同 → 底部浮条出现 */
  const isDirty =
    draft !== null && normalizeDraft(draft) !== normalizeDraft(featureInitialValues)

  // 切换功能（同路由不同 id）或后端数据刷新后，重置本地编辑态
  useEffect(() => {
    setStatus(toMenuStatus(node.status))
    setDraft(null)
    setResetSeq(0)
    setFeatureError(null)
  }, [node.menu_id, node.status])

  const handleValuesChange = useCallback((values: FeatureFormValues) => {
    setDraft(values)
  }, [])

  const [formTarget, setFormTarget] = useState<PermissionFormTarget>(null)
  const [permissionFormError, setPermissionFormError] = useState<string | null>(null)
  const createPermissionMutation = useMutation(postSystemMenuMutation())
  const updatePermissionMutation = useMutation(putSystemMenuMutation())

  const [deletePermissionTarget, setDeletePermissionTarget] = useState<MenuNode | null>(
    null,
  )
  const [deletePermissionError, setDeletePermissionError] = useState<string | null>(null)
  const deletePermissionMutation = useMutation(deleteSystemMenuByIdMutation())

  const [deleteFeatureOpen, setDeleteFeatureOpen] = useState(false)
  const [deleteFeatureError, setDeleteFeatureError] = useState<string | null>(null)
  const deleteFeatureMutation = useMutation(deleteSystemMenuByIdMutation())

  /** 回到上一级：父级是根层级（或没有父）时回功能列表，否则回父节点视图。 */
  const goToParent = useCallback(() => {
    const parentId = node.parent_id
    if (
      parentId === undefined ||
      parentId === null ||
      parentId === 0 ||
      parentId === MENU_ROOT_ID
    ) {
      navigate({ to: '/$appId/system/menus', params: { appId } })
      return
    }
    navigate({
      to: '/$appId/system/menus/$featureId',
      params: { appId, featureId: String(parentId) },
    })
  }, [appId, navigate, node.parent_id])

  /** 子项下钻：功能组与功能走同一条动态路由（权限不可点，由 `menuIsNavigable` 拦下）。 */
  const openChild = useCallback(
    (child: MenuNode) => {
      if (!menuIsNavigable(child) || child.menu_id === undefined || child.menu_id === null) {
        return
      }
      navigate({
        to: '/$appId/system/menus/$featureId',
        params: { appId, featureId: String(child.menu_id) },
      })
    },
    [appId, navigate],
  )

  /** 保存功能自身（PUT /system/menu）。 */
  const handleFeatureSubmit = useCallback(
    async (values: FeatureFormValues) => {
      if (node.menu_id === undefined || node.menu_id === null) return

      setFeatureError(null)
      try {
        await updateFeatureMutation.mutateAsync({
          body: {
            menu_id: node.menu_id,
            menu_name: values.menu_name,
            // 后端目前仍要求 component 非空，先填占位值（见 MENU_PLACEHOLDER_COMPONENT）
            component: MENU_PLACEHOLDER_COMPONENT,
            // 路由地址是**用户真实填写的落点**：侧边栏按它拼 `/${appId}${path}` 跳转
            path: values.path ?? '',
            permission: values.permission,
            api_keys: values.api_keys,
            icon: values.icon,
            sort: values.sort,
            status: values.status,
            visible: values.visible,
            // 显式回传原上级，避免后端把缺失的 parent_id 当成根层级而把功能移走
            parent_id: node.parent_id,
          },
        })
        await invalidateFeaturesTree()
        toast.add({
          title: t('form.successFeatureUpdate', '功能更新成功'),
          variant: 'success',
        })
        // 保存成功后清空草稿，底部浮条随之收起
        setDraft(null)
      } catch (error) {
        setFeatureError(
          extractApiErrorMessage(error, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [invalidateFeaturesTree, node.menu_id, node.parent_id, t, toast, updateFeatureMutation],
  )

  /**
   * 打开删除功能的确认弹窗。
   * 有子项的节点先不允许删除：直接在按钮处提示，而不是等后端报错。
   */
  const handleDeleteFeatureClick = useCallback(() => {
    if (children.length > 0) {
      toast.add({
        title: t(
          'detail.deleteBlocked',
          '该节点下还有 {{total}} 个子项，请先删除子项',
          { total: children.length },
        ),
        variant: 'warning',
      })
      return
    }
    setDeleteFeatureError(null)
    setDeleteFeatureOpen(true)
  }, [children.length, t, toast])

  /** 浮条「保存」：先跑一遍与表单相同的校验，通过后再提交草稿 */
  const handleSaveDraft = useCallback(() => {
    if (!draft) return
    // 浮条保存不经过 <form> 的 submit，校验要在这里补一次（否则会绕过前端校验）
    const invalid = validateFeatureForm(draft, t, 'feature')
    if (invalid) {
      setFeatureError(invalid.message)
      return
    }
    setFeatureError(null)
    void handleFeatureSubmit(draft)
  }, [draft, handleFeatureSubmit, t])

  /*
    AI 表单桥的**提交那一半**（字段读写由 `FeatureForm` 用同一个 id 注册）。
    `canSubmit` 直接复用 `isDirty`：没改动就拒绝 —— 否则 AI 会弹一张「是否提交」的审批卡，
    用户点了才发现没有任何改动，纯属白问一次。
  */
  useAiFormSubmit({
    id: AI_FEATURE_FORM_ID,
    submit: handleSaveDraft,
    canSubmit: () => isDirty,
  })

  /** 浮条「重置」：清空草稿、恢复页头开关，并重建表单回到初始值 */
  const handleResetDraft = useCallback(() => {
    setDraft(null)
    setStatus(toMenuStatus(node.status))
    setResetSeq((seq) => seq + 1)
    setFeatureError(null)
  }, [node.status])

  /** 删除当前功能：成功后整棵树失效并回到上一级。 */
  const handleDeleteFeature = useCallback(async () => {
    if (node.menu_id === undefined || node.menu_id === null) return

    setDeleteFeatureError(null)
    try {
      await deleteFeatureMutation.mutateAsync({ path: { id: node.menu_id } })
      await invalidateFeaturesTree()
      toast.add({
        title: t('form.successFeatureDelete', '功能删除成功'),
        variant: 'success',
      })
      setDeleteFeatureOpen(false)
      goToParent()
    } catch (error) {
      setDeleteFeatureError(
        extractApiErrorMessage(error, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [
    deleteFeatureMutation,
    goToParent,
    invalidateFeaturesTree,
    node.menu_id,
    t,
    toast,
  ])

  const openCreatePermission = useCallback(() => {
    setPermissionFormError(null)
    setFormTarget('create')
  }, [])

  const openEditPermission = useCallback((target: MenuNode) => {
    setPermissionFormError(null)
    setFormTarget(target)
  }, [])

  const closePermissionForm = useCallback(() => {
    setFormTarget(null)
    setPermissionFormError(null)
  }, [])

  const openDeletePermission = useCallback((target: MenuNode) => {
    setDeletePermissionError(null)
    setDeletePermissionTarget(target)
  }, [])

  const closeDeletePermission = useCallback(() => {
    setDeletePermissionTarget(null)
    setDeletePermissionError(null)
  }, [])

  /** 新建 / 编辑权限：同一个表单，按是否有编辑目标决定走 POST 还是 PUT。 */
  const handlePermissionSubmit = useCallback(
    async (values: FeatureFormValues) => {
      setPermissionFormError(null)
      const editing = formTarget !== null && formTarget !== 'create' ? formTarget : null

      try {
        if (editing?.menu_id !== undefined && editing.menu_id !== null) {
          await updatePermissionMutation.mutateAsync({
            body: {
              menu_id: editing.menu_id,
              menu_name: values.menu_name,
              parent_id: editing.parent_id ?? node.menu_id,
              component: MENU_PLACEHOLDER_COMPONENT,
              // 操作（menu_type=3）是按钮级权限点，没有页面落点 → 路由地址留空
              path: '',
              permission: values.permission,
              api_keys: values.api_keys,
              icon: values.icon,
              sort: values.sort,
              status: values.status,
              visible: values.visible,
            },
          })
          toast.add({
            title: t('form.successPermissionUpdate', '权限更新成功'),
            variant: 'success',
          })
        } else {
          await createPermissionMutation.mutateAsync({
            body: {
              menu_name: values.menu_name,
              // 功能详情下创建的一律是权限点（menu_type=3）
              menu_type: MENU_TYPE.action,
              parent_id: node.menu_id,
              component: MENU_PLACEHOLDER_COMPONENT,
              // 操作没有页面落点 → 路由地址留空
              path: '',
              permission: values.permission,
              api_keys: values.api_keys,
              icon: values.icon,
              sort: values.sort,
              status: values.status,
              visible: values.visible,
            },
          })
          toast.add({
            title: t('form.successPermission', '权限创建成功'),
            variant: 'success',
          })
        }

        await invalidateFeaturesTree()
        closePermissionForm()
      } catch (error) {
        setPermissionFormError(
          extractApiErrorMessage(error, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [
      closePermissionForm,
      createPermissionMutation,
      formTarget,
      invalidateFeaturesTree,
      node.menu_id,
      t,
      toast,
      updatePermissionMutation,
    ],
  )

  const handleDeletePermission = useCallback(async () => {
    const targetId = deletePermissionTarget?.menu_id
    if (targetId === undefined || targetId === null) return

    setDeletePermissionError(null)
    try {
      await deletePermissionMutation.mutateAsync({ path: { id: targetId } })
      await invalidateFeaturesTree()
      toast.add({
        title: t('form.successPermissionDelete', '权限删除成功'),
        variant: 'success',
      })
      closeDeletePermission()
    } catch (error) {
      setDeletePermissionError(
        extractApiErrorMessage(error, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [
    closeDeletePermission,
    deletePermissionMutation,
    deletePermissionTarget,
    invalidateFeaturesTree,
    t,
    toast,
  ])

  const childColumns = useFeatureColumns({
    onOpenNode: openChild,
    columns: FEATURE_CHILD_COLUMN_SPECS,
  })

  /*
    按钮级权限收口：与功能树、数据字典、用户列表共用同一套判定
    （`useHasPermission` → `hasPermission` → 权限 store）。
  */
  const canCreate = useHasPermission('feature:create')
  const canEdit = useHasPermission('feature:edit')
  const canDelete = useHasPermission('feature:delete')
  const canOperatePermissions = canEdit || canDelete

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...childColumns,

        // 操作列：权限的编辑 / 删除；两项都无权限时整列不渲染
        ...(canOperatePermissions
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
                      {/* 图标走 children + gap，不用 icon 属性（Kumo 内部写死 mr-2，RTL 下不镜像） */}
                      {canEdit ? (
                        <DropdownMenu.Item
                          className="gap-2"
                          onClick={() => openEditPermission(row.original)}
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
                            onClick={() => openDeletePermission(row.original)}
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
    [
      canDelete,
      canEdit,
      canOperatePermissions,
      childColumns,
      openDeletePermission,
      openEditPermission,
      t,
    ],
  )

  const childTable = useTable({
    features: stockFeatures,
    data: children,
    columns,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={node.menu_name || t('title', '功能')}
        description={
          // 副标题用权限编码作为标识：路由路径（path）在新架构中已废弃
          <span className="font-mono text-xs">{node.permission || '-'}</span>
        }
        actions={
          // 「启用」开关放到页头右侧，表单里不再渲染（改用受控 status）；
          // 无 `feature:edit` 时禁用 —— 开关在表单外，不受 `fieldset[disabled]` 覆盖
          <Switch
            disabled={!canEdit}
            checked={status === MENU_STATUS.enabled}
            onCheckedChange={(checked) =>
              setStatus(checked ? MENU_STATUS.enabled : MENU_STATUS.disabled)
            }
            label={
              status === MENU_STATUS.enabled
                ? t('form.statusEnabled', '启用')
                : t('form.statusDisabled', '禁用')
            }
          />
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/*
          左列：功能表单 + 权限列表。
          移动端（单列）用 order 把信息卡片提到前面，因此这里是 order-2。
        */}
        <div className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-2">
          <FeatureForm
            // 切换功能 / 重置时重建表单，回到初始值
            key={`${node.menu_id ?? 'feature'}-${resetSeq}`}
            variant="feature"
            initialValues={featureInitialValues}
            heading={t('detail.basicInfo', '基本信息')}
            // 动作交给底部「未保存更改」浮条；启用开关在页头
            showActions={false}
            showStatusSwitch={false}
            // 无 `feature:edit` 时整表只读（路由只要求 feature:read，viewer 能进到这一页）
            readOnly={!canEdit}
            status={status}
            onStatusChange={setStatus}
            onValuesChange={handleValuesChange}
            // AI 表单桥：让 AI 能读改这张表单（提交要过审批，见上面的 useAiFormSubmit）
            aiForm={{
              id: AI_FEATURE_FORM_ID,
              title: t('detail.basicInfo', '基本信息'),
            }}
            submitting={updateFeatureMutation.isPending}
            onSubmit={(values) => {
              void handleFeatureSubmit(values)
            }}
          />

          {/*
            权限列表：这是一张「简洁表格」—— 不需要搜索、筛选与列设置，
            「添加权限」直接放在卡片头部右侧（DataTable.headerActions），行末 actions 支持编辑 / 删除。
          */}
          <DataTable
            table={childTable}
            // 头部只留标题，统计信息挪到卡片尾部
            headerTitle={t('detail.childrenTitle', '权限')}
            footer={
              <span>
                {t('detail.childrenQuota', '共 {{total}} 项', {
                  total: children.length,
                })}
              </span>
            }
            headerActions={
              // 添加权限需要 `feature:create`（与功能树的新建入口同一权限点）
              canCreate ? (
                <Button
                  variant="ghost"
                  icon={<PlusIcon size={16} />}
                  onClick={openCreatePermission}
                >
                  {t('createPermission', '添加权限')}
                </Button>
              ) : undefined
            }
            emptyTitle={t('detail.childrenEmpty.title', '暂无权限')}
            emptyDescription={t(
              'detail.childrenEmpty.description',
              '该功能下还没有权限，可用「添加权限」继续创建',
            )}
            emptyIcon={<TreeStructureIcon size={44} className="text-kumo-inactive" />}
          />
        </div>

        {/*
          侧栏：权限标识 / 详细信息 / 危险操作。
          移动端用 order-1 优先展示（先看信息再改表单），桌面端回到右侧并吸顶。
        */}
        <aside className="order-1 flex flex-col gap-4 self-start lg:order-2 lg:sticky lg:top-20">
          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('columns.permission', '权限标识')}</LayerCard.Secondary>
            <LayerCard.Primary className="p-4">
              {node.permission ? (
                <ClipboardText
                  text={node.permission}
                  className="font-mono text-sm"
                  tooltip={{
                    text: t('detail.copy', '复制'),
                    copiedText: t('detail.copied', '已复制'),
                  }}
                  labels={{ copyAction: t('detail.copy', '复制') }}
                />
              ) : (
                <span className="text-sm text-kumo-subtle">-</span>
              )}
            </LayerCard.Primary>
          </LayerCard>

          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('detail.details', '详细信息')}</LayerCard.Secondary>
            <LayerCard.Primary className="flex flex-col gap-3 p-4">
              <SidebarField label={t('columns.menu_id', 'ID')}>
                <span className="font-mono">{node.menu_id ?? '-'}</span>
              </SidebarField>
              <SidebarField label={t('columns.menu_type', '类型')}>
                {featureTypeBadge(node.menu_type, t)}
              </SidebarField>
              <SidebarField label={t('detail.parentFeature', '上级 ID')}>
                {node.parent_id && node.parent_id !== 0 ? (
                  <span className="font-mono">{node.parent_id}</span>
                ) : (
                  t('detail.rootFeature', '根层级')
                )}
              </SidebarField>
              <SidebarField label={t('columns.is_frame', '外链')}>
                {featureIsFrameBadge(node.is_frame, t)}
              </SidebarField>
              <SidebarField label={t('columns.no_cache', '缓存')}>
                {featureNoCacheBadge(node.no_cache, t)}
              </SidebarField>
              <SidebarField label={t('columns.created_at', '创建时间')}>
                {formatMaybeTime(node.created_at, formatDateTime)}
              </SidebarField>
              <SidebarField label={t('columns.updated_at', '更新时间')}>
                {formatMaybeTime(node.updated_at, formatDateTime)}
              </SidebarField>
            </LayerCard.Primary>
          </LayerCard>

          {/* 危险操作：无 `feature:delete` 权限时整块不渲染（而不是留一个点了报错的按钮） */}
          {canDelete ? (
            <LayerCard className="p-0">
              <LayerCard.Secondary>
                {t('detail.dangerZone', '危险操作')}
              </LayerCard.Secondary>
              <LayerCard.Primary className="p-4">
                <Button
                  variant="secondary-destructive"
                  icon={<Trash size={16} />}
                  onClick={handleDeleteFeatureClick}
                >
                  {t('detail.deleteFeature', '删除功能')}
                </Button>
              </LayerCard.Primary>
            </LayerCard>
          ) : null}
        </aside>
      </div>

      <FeatureFormDialog
        // 新建与编辑共用同一个弹窗，用 key 保证切换目标时表单状态被重置
        key={formTarget === 'create' ? 'create' : (formTarget?.menu_id ?? 'closed')}
        open={formTarget !== null}
        onOpenChange={(open) => {
          if (!open) closePermissionForm()
        }}
        variant="button"
        target={formTarget === 'create' ? undefined : (formTarget ?? undefined)}
        formId="feature-permission-form"
        title={
          formTarget && formTarget !== 'create'
            ? t('permissionDialog.editTitle', '编辑权限')
            : t('permissionDialog.createTitle', '添加权限')
        }
        description={
          formTarget && formTarget !== 'create'
            ? t('permissionDialog.editDescription', '修改该权限的名称、权限标识与状态')
            : t('permissionDialog.createDescription', '在当前功能下新增一个权限点')
        }
        submitLabel={
          formTarget && formTarget !== 'create'
            ? t('form.save', '保存')
            : t('form.submitButton', '创建权限')
        }
        submitting={
          createPermissionMutation.isPending || updatePermissionMutation.isPending
        }
        submitError={permissionFormError}
        onSubmit={(values) => {
          void handlePermissionSubmit(values)
        }}
      />

      <FeaturePermissionDeleteDialog
        open={deletePermissionTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeDeletePermission()
        }}
        target={deletePermissionTarget ?? undefined}
        deleting={deletePermissionMutation.isPending}
        errorMessage={deletePermissionError}
        onConfirm={() => {
          void handleDeletePermission()
        }}
      />

      {/* 删除当前功能：必须输入功能名才能确认（防误操作） */}
      <DangerConfirmDialog
        open={deleteFeatureOpen}
        onOpenChange={setDeleteFeatureOpen}
        title={t('detail.deleteFeatureTitle', '删除功能')}
        description={
          <Trans
            i18nKey="detail.deleteFeatureConfirm"
            ns="features"
            defaults="该操作不可撤销。将永久删除功能 <b>{{name}}</b>，以及它在功能树中的位置。"
            values={{ name: node.menu_name ?? '' }}
            components={{ b: <b className="font-medium text-kumo-default" /> }}
          />
        }
        confirmationText={node.menu_name ?? ''}
        confirmLabel={t('detail.deleteFeature', '删除功能')}
        loading={deleteFeatureMutation.isPending}
        errorMessage={deleteFeatureError}
        onConfirm={() => {
          void handleDeleteFeature()
        }}
      />

      {/* 未保存更改浮条：表单变脏时从底部居中弹出（通用组件）。
          只读时不会有脏值，但也显式关掉 —— 免得将来某处漏改字段把浮条顶出来。 */}
      <UnsavedChangesBar
        open={isDirty && canEdit}
        saving={updateFeatureMutation.isPending}
        errorMessage={featureError}
        onReset={handleResetDraft}
        onSave={handleSaveDraft}
      />
    </div>
  )
}
