import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { UserItem } from '#/api'
import { getUserFormMetadata, UserFormView } from './user-form-view'

export interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialData?: UserItem | null
  userId?: number | string | null
  onSuccess: () => void
}

export function UserFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  userId,
  onSuccess,
}: UserFormDialogProps) {
  const { t } = useTranslation('users')
  const isEdit = mode === 'edit' || !!userId
  const formId = `user-dialog-form-${mode}`
  const meta = getUserFormMetadata(isEdit ? 'edit' : 'create', t)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{meta.title}</LayerDialog.Title>
        <LayerDialog.Description>{meta.description}</LayerDialog.Description>

        <LayerDialog.Body>
          <UserFormView
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
