import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import type { MenuNode } from '#/api'

/**
 * 删除权限的确认弹窗。
 *
 * 权限是叶子节点、误删影响面小，因此用轻量的 `LayerDialog.Alert` 一句话确认，
 * 不要求输入名称；需要「输入指定内容才能确认」的场景请用通用
 * `#/components/danger-confirm-dialog`（功能 / 功能组的删除走它）。
 */

interface FeaturePermissionDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target?: MenuNode
  deleting: boolean
  errorMessage?: string | null
  onConfirm: () => void
}

/** 删除权限的确认弹窗（不可撤销操作，用 `LayerDialog.Alert` 强制显式选择）。 */
export function FeaturePermissionDeleteDialog({
  open,
  onOpenChange,
  target,
  deleting,
  errorMessage,
  onConfirm,
}: FeaturePermissionDeleteDialogProps) {
  const { t } = useTranslation('menus')

  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {t('permissionDialog.deleteTitle', '删除权限')}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {t(
            'permissionDialog.deleteConfirm',
            '确定要删除「{{name}}」吗？该操作不可撤销。',
            { name: target?.menu_name ?? '' },
          )}
        </LayerDialog.Description>

        <LayerDialog.Body>
          {errorMessage ? (
            <p className="text-sm text-kumo-danger" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            onClick={onConfirm}
            loading={deleting}
          >
            {t('permissionDialog.delete', '删除')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  )
}
