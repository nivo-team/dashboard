import { LayerDialog } from '@cloudflare/kumo'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuNode } from '#/api'
import { toMenuStatus, toMenuVisible } from './feature-options'
import { FeatureForm } from './feature-form'
import type { FeatureFormValues } from './feature-form'

/**
 * 通用的「功能 / 功能组 / 权限」表单弹窗。
 *
 * 复用 `FeatureForm`（同一套字段与校验），只负责把它塞进 `LayerDialog`：
 * - 字段差异交给 `variant`（`group` 不出权限标识与绑定接口、`button` 不出「显示」开关）；
 * - 标题、描述、提交按钮文案由调用方给，因此「添加权限」「编辑功能组」等场景共用同一个组件；
 * - `LayerDialog.Actions.Primary` 用 HTML 的 `form` 属性提交 Body 里的表单，所以 `formId` 必须唯一
 *   （同一页面可能同时挂载多个弹窗）。
 */

interface FeatureFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 类型：决定字段显隐与默认文案。 */
  variant: 'group' | 'feature' | 'button'
  /** 编辑目标；缺省表示新建。 */
  target?: MenuNode
  /** 弹窗标题。 */
  title: string
  /** 弹窗描述（可选）。 */
  description?: ReactNode
  /** 表单 id（页面内唯一，供 Dialog Actions 关联提交）。 */
  formId: string
  submitting: boolean
  submitError?: string | null
  /** 提交按钮文案（新建 / 编辑通常不同）。 */
  submitLabel: string
  onSubmit: (values: FeatureFormValues) => void
}

export function FeatureFormDialog({
  open,
  onOpenChange,
  variant,
  target,
  title,
  description,
  formId,
  submitting,
  submitError,
  submitLabel,
  onSubmit,
}: FeatureFormDialogProps) {
  const { t } = useTranslation('features')
  const isEdit = Boolean(target)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        {description ? (
          <LayerDialog.Description>{description}</LayerDialog.Description>
        ) : null}

        <LayerDialog.Body>
          <FeatureForm
            variant={variant}
            layout="dialog"
            formId={formId}
            initialValues={
              isEdit && target
                ? {
                    menu_name: target.menu_name,
                    permission: target.permission,
                    api_keys: target.api_keys ?? [],
                    icon: target.icon,
                    sort: target.sort,
                    status: toMenuStatus(target.status),
                    visible: toMenuVisible(target.visible),
                  }
                : undefined
            }
            submitting={submitting}
            submitError={submitError}
            onSubmit={onSubmit}
          />
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={formId} type="submit" loading={submitting}>
            {submitLabel}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
