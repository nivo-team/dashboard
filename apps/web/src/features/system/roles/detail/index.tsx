import { LayerCard, Switch, useKumoToastManager } from '@cloudflare/kumo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getRoleByIdQueryKey,
  getRoleByIdQueryOptions,
  getRoleMenusQueryKey,
  getRoleMenusQueryOptions,
  getSystemMenuTreeQueryOptions,
  putRoleMenusMutation,
  putRoleMutation,
} from '#/api'
import type { MenuNode } from '#/api'
import { PageHeader } from '#/components/page-header'
import { UnsavedChangesBar } from '#/components/unsaved-changes-bar'
import { extractApiErrorMessage } from '#/lib/api-error'
import { useFeature } from '#/lib/features'
import { useHasPermission } from '#/lib/permissions'
import { appToastManager } from '#/lib/toast'
import {
  ROLE_STATUS,
  RoleForm,
  validateRoleForm,
  type RoleFormValues,
} from '../role-form'
import { MenuTreeSelection } from '../role-menu-tree'
import { createRoleDetailFeature } from './feature'

/** 角色码不可改的内置角色（它们是登录账号关联角色的键）。 */
const BUILT_IN_CODES = ['super', 'editor', 'viewer']

/** 规范化草稿用于「未保存更改」比较：忽略首尾空白。 */
function normalize(values: RoleFormValues): string {
  return [
    values.name.trim(),
    values.code.trim(),
    values.description.trim(),
    values.status,
    values.sort,
  ].join('|')
}

/** 授权 id 集合的相等比较（顺序无关）。 */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((id) => set.has(id))
}

/**
 * 角色详情（`/$appId/system/roles/$roleId`）。
 *
 * 两件事在同一个浮条里提交：
 * 1. **基本信息**（`PUT /role`）—— 表单内嵌，动作交给浮条；
 * 2. **菜单授权**（`PUT /role/menus`）—— 独立的关联资源，但改动同样算「未保存」。
 *
 * 校验只在 `validateRoleForm` 一处（浮条保存不经过 `<form>` 的 submit，见 skill `editable-detail`）。
 */
export function RoleDetailPage() {
  const { t } = useTranslation('roles')
  const toast = useKumoToastManager()
  const queryClient = useQueryClient()
  const { appId, roleId } = useParams({ from: '/$appId/system/roles/$roleId' })
  const numericId = Number(roleId)

  const canEdit = useHasPermission('role:edit')

  const roleQuery = useQuery(
    getRoleByIdQueryOptions({ path: { id: numericId } }),
  )
  const role = roleQuery.data?.result

  const menusQuery = useQuery(
    getRoleMenusQueryOptions({ query: { role_id: numericId } }),
  )
  const menuTreeQuery = useQuery(getSystemMenuTreeQueryOptions())
  const menuTree = (menuTreeQuery.data?.result ?? []) as MenuNode[]

  // ① 页头开关（受控）② 表单草稿 ③ 重建序号 ④ 提交错误 ⑤ 授权草稿 ⑥ 保存错误
  const [status, setStatus] = useState<number>(ROLE_STATUS.enabled)
  const [draft, setDraft] = useState<RoleFormValues | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [menusDraft, setMenusDraft] = useState<number[] | null>(null)

  const initialValues = useMemo<Partial<RoleFormValues>>(
    () => ({
      name: role?.name ?? '',
      code: role?.code ?? '',
      description: role?.description ?? '',
      status: role?.status ?? ROLE_STATUS.enabled,
      sort: role?.sort ?? 1,
    }),
    [role?.name, role?.code, role?.description, role?.status, role?.sort],
  )

  const initialMenuIds = useMemo(
    () => menusQuery.data?.result?.menu_ids ?? [],
    [menusQuery.data],
  )

  const normalizedInitial = useMemo(
    () =>
      normalize({
        name: initialValues.name ?? '',
        code: initialValues.code ?? '',
        description: initialValues.description ?? '',
        status: initialValues.status ?? ROLE_STATUS.enabled,
        sort: initialValues.sort ?? 1,
      }),
    [initialValues],
  )

  const isFormDirty = draft !== null && normalize(draft) !== normalizedInitial
  const isMenusDirty = menusDraft !== null && !sameIds(menusDraft, initialMenuIds)
  const isDirty = isFormDirty || isMenusDirty

  /*
    切换角色 / 后端刷新 → 重置全部本地编辑态。
    依赖只写 `role?.id` 与 `role?.status`：**不要写 `role` 对象本身** ——
    它在每次 refetch 后都是新引用，effect 会跟着重跑，把用户正在编辑的草稿清掉
    （见 skill `editable-detail` 坑 4）。
  */
  useEffect(() => {
    if (role) setStatus(role.status)
    setDraft(null)
    setMenusDraft(null)
    setResetSeq(0)
    setFormError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role?.id, role?.status])

  const handleValuesChange = useCallback((values: RoleFormValues) => setDraft(values), [])

  const updateMutation = useMutation(putRoleMutation())
  const menusMutation = useMutation(putRoleMenusMutation())
  const saving = updateMutation.isPending || menusMutation.isPending

  const handleSave = useCallback(async () => {
    if (!role) return
    setFormError(null)

    // 浮条保存不经过 <form> 的 submit，校验必须在这里补一次
    if (isFormDirty && draft) {
      const invalid = validateRoleForm(draft, t)
      if (invalid) {
        setFormError(invalid.message)
        return
      }
    }

    try {
      if (isFormDirty && draft) {
        await updateMutation.mutateAsync({
          body: {
            id: role.id,
            name: draft.name.trim(),
            // 内置角色的角色码后端会拒绝修改，这里不发
            ...(BUILT_IN_CODES.includes(role.code) ? {} : { code: draft.code.trim() }),
            description: draft.description.trim(),
            status: draft.status,
            sort: draft.sort,
          },
        })
      }

      if (isMenusDirty && menusDraft) {
        await menusMutation.mutateAsync({
          body: { role_id: role.id, menu_ids: menusDraft },
        })
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getRoleByIdQueryKey({ path: { id: role.id } }) }),
        queryClient.invalidateQueries({ queryKey: getRoleMenusQueryKey({ query: { role_id: role.id } }) }),
        queryClient.invalidateQueries({ queryKey: ['getRole'] }),
      ])

      // 保存成功后必须清空草稿，否则浮条不收起
      setDraft(null)
      setMenusDraft(null)
      toast.add({ title: t('form.successUpdate', '保存成功'), variant: 'success' })
    } catch (error) {
      setFormError(
        extractApiErrorMessage(error, t('form.failed', '操作失败，请稍后重试')),
      )
    }
  }, [
    role,
    draft,
    menusDraft,
    isFormDirty,
    isMenusDirty,
    updateMutation,
    menusMutation,
    queryClient,
    toast,
    t,
  ])

  const handleReset = useCallback(() => {
    setDraft(null)
    setMenusDraft(null)
    if (role) setStatus(role.status)
    setResetSeq((seq) => seq + 1)
    setFormError(null)
  }, [role])

  useFeature(
    createRoleDetailFeature({
      role: role ?? null,
      menuIds: menusDraft ?? initialMenuIds,
      loading: roleQuery.isPending,
      reload: roleQuery.refetch,
    }),
  )

  if (roleQuery.isError || (!roleQuery.isPending && !role)) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t('detail.notFound', '未找到该角色')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={role?.name ?? t('title', '角色管理')}
        description={<span className="font-mono text-xs">{role?.code ?? '-'}</span>}
        actions={
          // 启用开关放到页头（表单里不再渲染）；无 `role:edit` 时禁用
          <Switch
            disabled={!canEdit}
            checked={status === ROLE_STATUS.enabled}
            onCheckedChange={(checked) =>
              setStatus(checked ? ROLE_STATUS.enabled : ROLE_STATUS.disabled)
            }
            label={
              status === ROLE_STATUS.enabled
                ? t('form.statusEnabled', '启用')
                : t('form.statusDisabled', '禁用')
            }
          />
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-2">
          {/* 基本信息：动作交给底部浮条 */}
          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('detail.basicInfo', '基本信息')}</LayerCard.Secondary>
            <LayerCard.Primary className="p-4">
              <RoleForm
                key={`${role?.id ?? 'role'}-${resetSeq}`}
                initialValues={initialValues}
                showStatusSwitch={false}
                status={status}
                onStatusChange={setStatus}
                onValuesChange={handleValuesChange}
                readOnly={!canEdit}
                codeLocked={BUILT_IN_CODES.includes(role?.code ?? '')}
                submitError={formError}
                onSubmit={() => {
                  /* 提交由浮条统一处理（showActions=false），这里不会触发 */
                }}
              />
            </LayerCard.Primary>
          </LayerCard>

          {/* 菜单授权：独立的关联资源，改动同样进浮条 */}
          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('detail.menuGrant', '可见菜单')}</LayerCard.Secondary>
            <LayerCard.Primary className="p-4">
              <p className="mb-3 text-sm text-kumo-subtle">
                {t(
                  'detail.menuGrantHint',
                  '勾选后该角色能在导航里看到这些菜单；勾选子项会自动带上它的上级。',
                )}
              </p>
              {menuTreeQuery.isPending ? (
                <p className="text-sm text-kumo-subtle">{t('detail.loading', '加载中…')}</p>
              ) : (
                <MenuTreeSelection
                  nodes={menuTree}
                  value={menusDraft ?? initialMenuIds}
                  disabled={!canEdit}
                  onChange={setMenusDraft}
                />
              )}
            </LayerCard.Primary>
          </LayerCard>
        </div>

        {/* 右列：只读信息，不重复表单里的字段 */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('detail.details', '详细信息')}</LayerCard.Secondary>
            <LayerCard.Primary className="flex flex-col gap-3 p-4 text-sm">
              <InfoRow label={t('detail.id', '角色 ID')} value={String(role?.id ?? '-')} />
              <InfoRow
                label={t('detail.menuCount', '已授权菜单')}
                value={String((menusDraft ?? initialMenuIds).length)}
              />
              <InfoRow
                label={t('columns.created_at', '创建时间')}
                value={role?.created_at ?? '-'}
              />
              <InfoRow
                label={t('columns.updated_at', '更新时间')}
                value={role?.updated_at ?? '-'}
              />
            </LayerCard.Primary>
          </LayerCard>
        </aside>
      </div>

      <UnsavedChangesBar
        open={isDirty && canEdit}
        saving={saving}
        errorMessage={formError}
        onReset={handleReset}
        onSave={() => {
          void handleSave()
        }}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-kumo-subtle">{label}</span>
      <span className="min-w-0 truncate text-end text-kumo-default">{value}</span>
    </div>
  )
}
