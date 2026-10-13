import {
  Badge,
  Button,
  DropdownMenu,
  LayerCard,
  Loader,
  Table,
  useKumoToastManager,
} from '@cloudflare/kumo'
import { DotsThree, PencilSimple, PlusIcon, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deleteAppByIdMutation,
  getAppQueryKey,
  getAppQueryOptions,
  postAppMutation,
  putAppMutation,
} from '#/api'
import type { ManagedAppItem } from '#/api'
import { DangerConfirmDialog } from '#/components/danger-confirm-dialog'
import { Can } from '#/components/permission-guard'
import { extractApiErrorMessage } from '#/lib/api-error'
import {
  fetchAvailableApps,
  isMultiAppEnabled,
  selectAppAndComplete,
  setAvailableApps,
  useAuth,
} from '#/lib/auth'
import { useFeature } from '#/features/ai/page'
import { useHasPermission } from '#/lib/permissions'
import { AppFormDialog } from './app-form-dialog'
import { APP_STATUS, type AppFormValues } from './app-form'
import { createSelectAppFeature, type SelectAppRow } from './feature'

/** 一屏内列出全部应用：应用数量天然很少，不做分页交互。 */
const APP_LIST_PAGE_SIZE = 200

/** `ManagedAppItem` → 表格行（管理视角）。 */
function toRowFromManaged(app: ManagedAppItem): SelectAppRow {
  return {
    id: app.id,
    name: app.name,
    category: app.category ?? '',
    description: app.description ?? '',
    enabled: app.status === APP_STATUS.enabled,
  }
}

/** `ManagedAppItem` → 表单值域（缺省补空串 / 默认状态）。 */
function toFormValues(app: ManagedAppItem): AppFormValues {
  return {
    id: app.id,
    name: app.name,
    headline: app.headline ?? '',
    description: app.description ?? '',
    domain: app.domain ?? '',
    apiBaseUrl: app.apiBaseUrl ?? '',
    badge: app.badge ?? '',
    category: app.category ?? '',
    themeGradient: app.themeGradient ?? '',
    status: app.status ?? APP_STATUS.enabled,
    sort: app.sort ?? 1,
  }
}

/**
 * 根路径：**应用选择 + 应用管理**（`/_main/index.tsx` → `/`）。
 *
 * 同一页，两种视图，按权限点 `app:read` 分档（该权限点只给超管）：
 * - **有 `app:read`**：`GET /app`（配置视角，含停用应用与管理字段），可新建 / 编辑 / 删除；
 * - **没有**：`GET /apps`（工作空间视角，只含启用应用），只读，点行进应用。
 *
 * 这样普通用户仍能从 `/` 进入工作空间，但拿不到也改不了应用清单 ——
 * 接口层另有 403 兜底（`apps/mock/server/routes/app*.ts`），前端只是「不显示」。
 */
export function SelectAppPage({ redirect: redirectUrl }: { redirect?: string }) {
  const { t } = useTranslation('apps')
  const router = useRouter()
  const navigate = useNavigate()
  const { user, availableApps } = useAuth()
  const toast = useKumoToastManager()
  const queryClient = useQueryClient()

  /** 应用管理（配置视角）能力：只有超管持有 `app:read`。 */
  const canManage = useHasPermission('app:read')
  /** 「操作」列是否出现：有任一写权限即可（单元格内部再用 `<Can>` 细化到按钮）。 */
  const showActions = useHasPermission({ any: ['app:edit', 'app:delete'] })

  const query = useQuery({
    ...getAppQueryOptions({ query: { page: 1, page_size: APP_LIST_PAGE_SIZE } }),
    enabled: canManage,
  })
  // 单独取出，`refetch` 引用稳定；直接依赖整个 `query` 对象会每次都重建回调
  const { refetch: refetchApps } = query

  const formId = `app-form-${useId().replace(/:/g, '')}`

  // 新建 / 编辑弹窗：`editingApp === null` 即新建
  const [editingApp, setEditingApp] = useState<ManagedAppItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<ManagedAppItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 只读视图（非超管）的取数状态：初值跟着分档走，避免首帧闪一下空态
  const [availableLoading, setAvailableLoading] = useState(!canManage)
  const [availableError, setAvailableError] = useState<string | null>(null)

  const createMutation = useMutation(postAppMutation())
  const updateMutation = useMutation(putAppMutation())
  const deleteMutation = useMutation(deleteAppByIdMutation())
  const submitting = createMutation.isPending || updateMutation.isPending

  /** 静默同步「启用应用」到认证 store（切换器与只读列表都读它）。 */
  const syncAvailableApps = useCallback(async () => {
    if (!isMultiAppEnabled()) return
    try {
      setAvailableApps(await fetchAvailableApps())
    } catch {
      // 管理视角的取数错误由 `query` 自己呈现，这里只做「顺手同步」，失败不打扰用户
    }
  }, [])

  /** 只读视图的主取数：带 loading / error，失败时页面显式提示。 */
  const reloadApplicableApps = useCallback(async () => {
    if (!isMultiAppEnabled()) return
    setAvailableLoading(true)
    setAvailableError(null)
    try {
      setAvailableApps(await fetchAvailableApps())
    } catch (error) {
      setAvailableError(
        extractApiErrorMessage(error, t('messages.fetchFailed', '获取应用列表失败')),
      )
    } finally {
      setAvailableLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (canManage) {
      void syncAvailableApps()
    } else {
      void reloadApplicableApps()
    }
  }, [canManage, syncAvailableApps, reloadApplicableApps])

  const rows = useMemo<SelectAppRow[]>(() => {
    if (canManage) return (query.data?.result?.items ?? []).map(toRowFromManaged)
    return availableApps.map((app) => ({
      id: app.id,
      name: app.name,
      category: app.category ?? '',
      description: app.description ?? '',
      // `GET /apps` 只下发启用应用
      enabled: true,
    }))
  }, [canManage, query.data, availableApps])

  const loading = canManage ? query.isPending || query.isFetching : availableLoading

  // 进入某个应用（仅启用中的应用可进入）
  const handleSelectApp = useCallback(
    (appId: string) => {
      selectAppAndComplete(appId)
      void router.invalidate()
      const target =
        redirectUrl &&
        redirectUrl.startsWith('/') &&
        redirectUrl !== '/select-app' &&
        redirectUrl !== '/'
          ? redirectUrl
          : `/${appId}/home`
      void navigate({ to: target as any })
    },
    [redirectUrl, router, navigate],
  )

  const reload = useCallback(() => {
    if (canManage) {
      void refetchApps()
    } else {
      void reloadApplicableApps()
    }
  }, [canManage, refetchApps, reloadApplicableApps])

  // 这一页对 AI 暴露的能力
  useFeature(createSelectAppFeature({ apps: rows, loading, reload }))

  const openCreate = () => {
    setEditingApp(null)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (app: ManagedAppItem) => {
    setEditingApp(app)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = useCallback(
    async (values: AppFormValues) => {
      setFormError(null)
      try {
        if (editingApp) {
          // `id` 必须排在展开**之后**：它要钉住当前编辑的那条记录，写在前面会被 values.id 覆盖
          await updateMutation.mutateAsync({ body: { ...values, id: editingApp.id } })
          toast.add({ title: t('form.successUpdate', '应用更新成功'), variant: 'success' })
        } else {
          await createMutation.mutateAsync({ body: values })
          toast.add({ title: t('form.successCreate', '应用创建成功'), variant: 'success' })
        }
        await queryClient.invalidateQueries({ queryKey: getAppQueryKey() })
        await syncAvailableApps()
        setFormOpen(false)
        setEditingApp(null)
      } catch (submitFailure) {
        setFormError(
          extractApiErrorMessage(submitFailure, t('form.failed', '操作失败，请稍后重试')),
        )
      }
    },
    [editingApp, updateMutation, createMutation, toast, t, queryClient, syncAvailableApps],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteTarget.id } })
      await queryClient.invalidateQueries({ queryKey: getAppQueryKey() })
      await syncAvailableApps()
      toast.add({ title: t('detail.deleteSuccess', '应用删除成功'), variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteFailure) {
      setDeleteError(
        extractApiErrorMessage(deleteFailure, t('form.deleteFailed', '删除失败，请稍后重试')),
      )
    }
  }, [deleteTarget, deleteMutation, queryClient, syncAvailableApps, toast, t])

  const errorMsg = canManage
    ? query.isError
      ? extractApiErrorMessage(query.error, t('messages.fetchFailed', '获取应用列表失败'))
      : null
    : availableError

  const showStatus = canManage
  const columnCount = 3 + (showStatus ? 1 : 0) + (showActions ? 1 : 0)

  return (
    <div className="animate-fade-in">
      {/* 顶部账号 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-kumo-subtle">{user?.username || 'Admin'}</p>
          <h1 className="mt-1.5 text-2xl font-semibold text-kumo-default sm:text-3xl">
            {t('selectApp.title', { ns: 'common', defaultValue: '应用' })}
          </h1>
          <p className="mt-1 text-sm text-kumo-subtle">
            {t('selectApp.subtitle', { ns: 'common', defaultValue: '选择一个应用。' })}
          </p>
        </div>
        <Can permission="app:create">
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
            {t('actions.create', '新建应用')}
          </Button>
        </Can>
      </div>

      {errorMsg ? (
        <div className="mt-6 flex items-center gap-3">
          <p className="text-sm text-kumo-danger" role="alert">
            {errorMsg}
          </p>
          <Button variant="secondary" size="sm" onClick={reload}>
            {t('actions.retry', '重试')}
          </Button>
        </div>
      ) : null}

      {/* Kumo UI 原生默认表格：LayerCard 包裹，无多余自定义样式，表头左对齐无排序 */}
      <LayerCard className="mt-6 p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t('selectApp.tableApp', { ns: 'common', defaultValue: '应用' })}</Table.Head>
              <Table.Head>{t('columns.category', '分类')}</Table.Head>
              {showStatus ? <Table.Head>{t('columns.status', '状态')}</Table.Head> : null}
              <Table.Head>{t('selectApp.tableDesc', { ns: 'common', defaultValue: '描述' })}</Table.Head>
              {showActions ? (
                <Table.Head className="text-end">{t('columns.actions', '操作')}</Table.Head>
              ) : null}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan={columnCount}>
                  <div className="flex items-center justify-center gap-3 py-6">
                    <Loader size={20} />
                    <span className="text-sm text-kumo-subtle">
                      {t('selectApp.loading', {
                        ns: 'common',
                        defaultValue: '正在加载应用列表…',
                      })}
                    </span>
                  </div>
                </Table.Cell>
              </Table.Row>
            ) : rows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columnCount}>
                  <div className="flex flex-col items-center gap-1 py-6">
                    <span className="text-sm font-medium text-kumo-default">
                      {t('empty.title', '暂无应用')}
                    </span>
                    <span className="text-sm text-kumo-subtle">
                      {canManage
                        ? t('empty.description', '还没有应用，可用「新建应用」创建')
                        : t('empty.noAvailable', '当前账号还没有可进入的应用')}
                    </span>
                  </div>
                </Table.Cell>
              </Table.Row>
            ) : (
              rows.map((app) => (
                <Table.Row
                  key={app.id}
                  onClick={() => {
                    if (app.enabled) handleSelectApp(app.id)
                  }}
                  className={app.enabled ? 'cursor-pointer' : 'text-kumo-subtle'}
                >
                  <Table.Cell>
                    <span
                      className={
                        app.enabled
                          ? 'font-medium underline underline-offset-4 hover:text-kumo-brand'
                          : 'font-medium'
                      }
                    >
                      {t(`apps.${app.id}.name`, { ns: 'common', defaultValue: app.name })}
                    </span>
                    <span className="ms-2 font-mono text-xs text-kumo-subtle">{app.id}</span>
                  </Table.Cell>
                  <Table.Cell className="text-kumo-subtle">{app.category || '—'}</Table.Cell>
                  {showStatus ? (
                    <Table.Cell>
                      <Badge variant={app.enabled ? 'success' : 'secondary'} appearance="dot">
                        {app.enabled
                          ? t('form.statusEnabled', '启用')
                          : t('form.statusDisabled', '禁用')}
                      </Badge>
                    </Table.Cell>
                  ) : null}
                  <Table.Cell className="text-kumo-subtle">
                    {t(`apps.${app.id}.description`, {
                      ns: 'common',
                      defaultValue: app.description || '—',
                    })}
                  </Table.Cell>
                  {showActions ? (
                    <Table.Cell className="text-end">
                      <DropdownMenu>
                        <DropdownMenu.Trigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              shape="square"
                              aria-label={t('rowActions.label', '更多操作')}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DotsThree weight="bold" size={16} />
                            </Button>
                          }
                        />
                        <DropdownMenu.Content align="end">
                          <Can permission="app:edit">
                            <DropdownMenu.Item
                              icon={PencilSimple}
                              onClick={() => {
                                const target = query.data?.result?.items.find(
                                  (item) => item.id === app.id,
                                )
                                if (target) openEdit(target)
                              }}
                            >
                              {t('rowActions.edit', '编辑')}
                            </DropdownMenu.Item>
                          </Can>
                          <Can permission="app:delete">
                            <Can permission="app:edit">
                              <DropdownMenu.Separator />
                            </Can>
                            <DropdownMenu.Item
                              icon={Trash}
                              variant="danger"
                              onClick={() => {
                                const target = query.data?.result?.items.find(
                                  (item) => item.id === app.id,
                                )
                                if (!target) return
                                setDeleteError(null)
                                setDeleteTarget(target)
                              }}
                            >
                              {t('rowActions.delete', '删除')}
                            </DropdownMenu.Item>
                          </Can>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    </Table.Cell>
                  ) : null}
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </LayerCard>

      {/* 新建 / 编辑弹窗：key 让初值随目标应用重建 */}
      <AppFormDialog
        key={editingApp?.id ?? 'create'}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditingApp(null)
            setFormError(null)
          }
        }}
        initialValues={editingApp ? toFormValues(editingApp) : undefined}
        formId={formId}
        title={editingApp ? t('form.editTitle', '编辑应用') : t('form.createTitle', '新建应用')}
        description={
          editingApp
            ? t('form.editDescription', '应用标识不可修改，其余字段可编辑')
            : t('form.createDescription', '应用标识将作为路由前缀与数据作用域，创建后不可修改')
        }
        submitLabel={editingApp ? t('form.save', '保存') : t('form.create', '创建')}
        submitting={submitting}
        submitError={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <DangerConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title={t('detail.deleteTitle', '删除应用')}
        description={
          <Trans
            i18nKey="detail.deleteConfirm"
            ns="apps"
            defaults="该操作不可撤销。将永久删除应用 <b>{{name}}</b> 及其工作空间入口。"
            values={{ name: deleteTarget?.name ?? '' }}
            components={{ b: <b className="font-medium text-kumo-default" /> }}
          />
        }
        confirmationText={deleteTarget?.id ?? ''}
        confirmLabel={t('detail.deleteAction', '确认删除')}
        cancelLabel={t('form.cancel', '取消')}
        loading={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
