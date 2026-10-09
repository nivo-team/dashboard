import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { UserItem } from '#/api'
import { getTableExampleFormMetadata, TableExampleFormView } from './form-view'

export interface TableExampleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialData?: UserItem | null
  userId?: number | string | null
  onSuccess: () => void
}

export function TableExampleFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  userId,
  onSuccess,
}: TableExampleFormDialogProps) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })
  const isEdit = mode === 'edit' || !!userId
  const formId = `table-example-dialog-form-${mode}`
  const meta = getTableExampleFormMetadata(isEdit ? 'edit' : 'create', t)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{meta.title}</LayerDialog.Title>
        <LayerDialog.Description>{meta.description}</LayerDialog.Description>

        <LayerDialog.Body>
          <TableExampleFormView
            variant="dialog"
            formId={formId}
            mode={mode}
            initialData={initialData}
            userId={userId}
            onSuccess={() => {
              onOpenChange(false)
              onSuccess()
            }}
            onClose={() => onOpenChange(false)}
          />
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={formId} type="submit">
            {t('form.save', '保存')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
