import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { TicketItem } from '#/api'
import { getTicketFormMetadata, TicketFormView } from './form-view'

/**
 * 弹窗形态的工单表单 —— 与 `table-example/form-dialog` 同一套：
 * 表单本体在 `TicketFormView`（`variant="dialog"`），这里只负责外壳与标题。
 */
export interface TicketFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialData?: TicketItem | null
  ticketId?: number | string | null
  onSuccess: () => void
}

export function TicketFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  ticketId,
  onSuccess,
}: TicketFormDialogProps) {
  const { t } = useTranslation('example', { keyPrefix: 'tickets' })
  const isEdit = mode === 'edit' || !!ticketId
  const formId = `ticket-dialog-form-${mode}`
  const meta = getTicketFormMetadata(isEdit ? 'edit' : 'create', t)

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="base">
        <LayerDialog.Title>{meta.title}</LayerDialog.Title>
        <LayerDialog.Description>{meta.description}</LayerDialog.Description>

        <LayerDialog.Body>
          <TicketFormView
            variant="dialog"
            formId={formId}
            mode={mode}
            initialData={initialData}
            ticketId={ticketId}
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
