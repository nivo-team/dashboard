import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { AppForm, type AppFormValues } from './app-form'

/**
 * 应用的新建 / 编辑弹窗（`/` 页内联管理用）。
 *
 * 字段与校验都在 `AppForm`（唯一一份），这里只负责弹窗外壳：
 * `LayerDialog.Actions.Primary` 用 HTML `form` 属性提交 Body 里的表单，
 * 所以 `formId` 必须页面内唯一。
 */
interface AppFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑态传当前应用的初值；新建不传（靠 `key` 重建初值）。 */
  initialValues?: Partial<AppFormValues>
  formId: string
  title: string
  description?: string
  submitLabel: string
  submitting: boolean
  submitError?: string | null
  onSubmit: (values: AppFormValues) => void
}

export function AppFormDialog({
  open,
  onOpenChange,
  initialValues,
  formId,
  title,
  description,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
}: AppFormDialogProps) {
  const { t } = useTranslation('apps')
  const isEdit = Boolean(initialValues?.id)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        {description ? <LayerDialog.Description>{description}</LayerDialog.Description> : null}

        <LayerDialog.Body>
          <AppForm
            formId={formId}
            initialValues={initialValues}
            idLocked={isEdit}
            showActions={false}
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
