import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { DictType, DictTypeFormValues } from './data-dict-types'
import { DictTypeForm } from './dict-type-form'

/**
 * 分类（type）的新建 / 编辑弹窗。
 *
 * 字段、校验与草稿上报都在 `DictTypeForm` —— 详情页内嵌的是**同一个组件**，
 * 这里只负责弹窗外壳：
 * - `LayerDialog.Actions.Primary` 用 HTML `form` 属性提交 Body 里的表单，因此 `formId` 必须页面内唯一；
 * - 「上级分类」不在这里出现：由调用方按入口决定（新建子分类 = 该分类 id；新建顶级 = 根分类），
 *   弹窗只用 `parentName` 说明「将创建在谁下面」，避免同一棵树在选择器里再渲染一遍。
 */

interface DictTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑场景的初始值；缺省即新建（弹窗关闭时不传，组件靠 `key` 重建初值）。 */
  initialValues?: Partial<DictTypeFormValues> | DictType
  /** 表单 id（页面内唯一，供 Dialog Actions 关联提交）。 */
  formId: string
  /** 将创建在谁下面（新建时展示）。 */
  parentName?: string
  title: string
  description?: string
  submitLabel: string
  submitting: boolean
  submitError?: string | null
  onSubmit: (values: DictTypeFormValues) => void
}

export function DictTypeFormDialog({
  open,
  onOpenChange,
  initialValues,
  formId,
  parentName,
  title,
  description,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
}: DictTypeFormDialogProps) {
  const { t } = useTranslation('dataDict')
  const isEdit = Boolean(initialValues?.id)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        {description ? <LayerDialog.Description>{description}</LayerDialog.Description> : null}

        <LayerDialog.Body>
          {!isEdit && parentName !== undefined ? (
            <p className="mb-4 text-sm text-kumo-subtle">
              {t('form.parentHint', '将创建在：{{parent}}', {
                parent: parentName || t('rootLevel', '根层级'),
              })}
            </p>
          ) : null}

          <DictTypeForm
            formId={formId}
            initialValues={initialValues}
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
