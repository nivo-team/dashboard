import { useKumoToastManager } from '@cloudflare/kumo'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postSystemMenuMutation } from '#/api'
import { PageHeader } from '#/components/page-header'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { FeatureForm } from './-components/feature-form'
import type { FeatureFormValues } from './-components/feature-form'
import {
  featureBreadcrumbPath,
  useFeatureBreadcrumbTrail,
} from './-data/feature-breadcrumb'
import {
  MENU_PLACEHOLDER_COMPONENT,
  MENU_PLACEHOLDER_PATH,
  MENU_ROOT_ID,
  MENU_TYPE,
  findMenuPath,
} from './-data/feature-options'
import {
  useFeaturesTree,
  useInvalidateFeaturesTree,
} from './-data/use-features-tree'

/**
 * 新建功能 / 功能组（/$appId/system/features/new?pid=<父id>[&type=group]）。
 *
 * - `pid`：新节点的父 id，直接用于绑定的 `parent_id`（容器视图传当前容器 id，
 *   功能详情传当前功能 id，根视图传 `MENU_ROOT_ID`）。缺省 / 非法时回落到根节点。
 * - `type`：`group` → 功能组（`menu_type=1`）；`button` → 按钮/操作（`menu_type=3`，
 *   功能详情下的权限点）；缺省 → 功能（`menu_type=2`）。
 *
 * 三种类型共用同一个表单与同一个 `POST /system/menu` 接口 —— 这是本模块唯一的写操作。
 * 提交成功后按 `pid` 原路返回（「从哪来回哪去」）：根/功能组 → 容器视图，功能 → 详情视图。
 */
export const Route = createFileRoute('/$appId/system/features/new')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { pid?: number; type?: 'group' | 'button' } => {
    const rawPid = Number(search.pid)
    return {
      pid: Number.isFinite(rawPid) && rawPid > 0 ? rawPid : undefined,
      type:
        search.type === 'group' ? 'group' : search.type === 'button' ? 'button' : undefined,
    }
  },
  component: NewFeaturePage,
})

function NewFeaturePage() {
  const { t } = useTranslation('features')
  const navigate = useNavigate()
  const { pid: searchPid, type } = Route.useSearch()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const toast = useKumoToastManager()
  const invalidateFeaturesTree = useInvalidateFeaturesTree()

  const pid = searchPid ?? MENU_ROOT_ID
  const isGroup = type === 'group'
  const isButton = type === 'button'

  const { nodes } = useFeaturesTree()

  /** 父节点（用于说明「将创建在谁下面」）。 */
  const { node: parentNode } = useMemo(() => findMenuPath(nodes, pid), [nodes, pid])

  const [submitError, setSubmitError] = useState<string | null>(null)

  const mutation = useMutation(postSystemMenuMutation())

  /** 回到父节点的落点视图：根 / 功能组 → 容器视图，功能 → 详情视图。 */
  const goBackToParent = useCallback(() => {
    if (pid === MENU_ROOT_ID) {
      navigate({ to: '/$appId/system/features', params: { appId } })
      return
    }
    navigate({
      to: '/$appId/system/features/$featureId',
      params: { appId, featureId: String(pid) },
    })
  }, [appId, navigate, pid])

  const handleSubmit = useCallback(
    async (values: FeatureFormValues) => {
      setSubmitError(null)
      try {
        await mutation.mutateAsync({
          body: {
            menu_name: values.menu_name,
            menu_type: isGroup
              ? MENU_TYPE.directory
              : isButton
                ? MENU_TYPE.action
                : MENU_TYPE.menu,
            parent_id: pid,
            // 后端目前仍要求 component 非空，先填占位值（见 MENU_PLACEHOLDER_COMPONENT）
            component: MENU_PLACEHOLDER_COMPONENT,
            path: MENU_PLACEHOLDER_PATH,
            permission: values.permission,
            api_keys: values.api_keys,
            icon: values.icon,
            sort: values.sort,
            status: values.status,
            visible: values.visible,
          },
        })

        // 整棵树是单一数据源，失效一次即可让列表与详情都拿到最新数据
        await invalidateFeaturesTree()
        toast.add({
          title: isGroup
            ? t('form.successGroup', '功能组创建成功')
            : isButton
              ? t('form.successButton', '按钮创建成功')
              : t('form.successFeature', '功能创建成功'),
          variant: 'success',
        })
        goBackToParent()
      } catch (error) {
        setSubmitError(
          extractApiErrorMessage(error, t('form.failed', '创建失败，请稍后重试')),
        )
      }
    },
    [goBackToParent, invalidateFeaturesTree, isGroup, mutation, pid, t, toast],
  )

  const title = isGroup
    ? t('form.createGroupTitle', '添加功能组')
    : isButton
      ? t('form.createButtonTitle', '添加按钮')
      : t('form.createFeatureTitle', '添加功能')

  // 把创建页也纳入顶栏面包屑层级：父级就是 pid 对应的节点（根层级时为功能根视图）
  const breadcrumbExtra = useMemo(
    () => ({
      [`/${appId}/system/features/new`]: {
        label: title,
        parent:
          pid === MENU_ROOT_ID
            ? featureBreadcrumbPath(appId)
            : featureBreadcrumbPath(appId, pid),
      },
    }),
    [appId, pid, title],
  )
  useFeatureBreadcrumbTrail(nodes, appId, breadcrumbExtra)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description={
          isGroup
            ? t('form.createGroupDescription', '创建一个功能组，用于对功能继续分层')
            : isButton
              ? t('form.createButtonDescription', '创建一个按钮，作为该功能下的权限点')
              : t('form.createFeatureDescription', '创建一个功能，作为平台能力的交付单元')
        }
      />

      <FeatureForm
        variant={isGroup ? 'group' : isButton ? 'button' : 'feature'}
        parentName={parentNode?.menu_name}
        submitting={mutation.isPending}
        submitError={submitError}
        onSubmit={(values) => {
          void handleSubmit(values)
        }}
        onCancel={goBackToParent}
      />
    </div>
  )
}
