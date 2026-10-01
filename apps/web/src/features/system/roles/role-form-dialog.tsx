import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { RoleForm, type RoleFormValues } from './role-form'

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting?: boolean
  submitError?: string | null
  onSubmit: (values: RoleFormValues) => void
}

/**
 * 新建角色弹窗（**列表页专用**）。
 *
 * 只承担「新建」语义 —— 角色的修改一律进详情页（`/$appId/system/roles/$roleId`），
 * 因为那里还要做菜单授权（关联表），不是一个弹窗能装下的。见 skill `editable-detail`。
 */
export function RoleFormDialog({
  open,
  onOpenChange,
  submitting = false,
  submitError = null,
  onSubmit,
}: RoleFormDialogProps) {
  const { t } = useTranslation('roles')
  // 固定 id：`LayerDialog.Actions.Primary` 的 `form` 属性靠它关联提交
  const formId = 'role-create-form'

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('form.createTitle', '新建角色')}</LayerDialog.Title>
        <LayerDialog.Description>
          {t('form.createDescription', '创建后到详情页为它分配可见菜单')}
        </LayerDialog.Description>

        <LayerDialog.Body>
          <RoleForm
            formId={formId}
            submitting={submitting}
            submitError={submitError}
            onSubmit={onSubmit}
          />
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={formId} type="submit" loading={submitting}>
            {t('form.create', '创建')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
