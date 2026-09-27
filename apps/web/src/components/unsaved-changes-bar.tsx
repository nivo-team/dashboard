import { Button, cn } from '@cloudflare/kumo'
import { InfoIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/**
 * 通用「未保存更改」编辑浮条。
 *
 * 表单变脏后在视口底部居中弹出，提供「重置 / 保存」两个动作；保存中按钮进入 loading，
 * 失败信息就地展示。模块只需维护「草稿 + 是否变脏」，浮条本身不关心表单结构，
 * 因此任何"编辑态"页面都可以复用（后续模块直接用同一组件即可）。
 *
 * 说明：这里刻意没有用 Kumo 的 Toasty —— 它的 viewport 固定为右下角 340px 卡片、
 * 且语义是自动消失的通知；而编辑浮条需要底部居中的宽条、持久驻留、并承载带 loading 的操作按钮。
 * 视觉上仍然只用 Kumo 语义令牌与 Button，保证与设计系统一致。
 */

export interface UnsavedChangesBarLabels {
  /** 提示文案，默认取 common 命名空间的 `unsavedChanges.message`。 */
  message?: string
  /** 重置按钮文案。 */
  reset?: string
  /** 保存按钮文案。 */
  save?: string
}

interface UnsavedChangesBarProps {
  /** 是否有未保存的更改；为 false 时不渲染。 */
  open: boolean
  /** 保存中：两个按钮禁用、保存按钮进入 loading。 */
  saving?: boolean
  /** 保存失败信息（就地展示在提示文案下方）。 */
  errorMessage?: string | null
  onReset: () => void
  onSave: () => void
  labels?: UnsavedChangesBarLabels
  className?: string
}

export function UnsavedChangesBar({
  open,
  saving = false,
  errorMessage,
  onReset,
  onSave,
  labels,
  className,
}: UnsavedChangesBarProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-kumo-contrast px-3 py-2.5 shadow-lg">
        <InfoIcon size={18} className="shrink-0 text-kumo-base" />

        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-kumo-base">
            {labels?.message ?? t('unsavedChanges.message', '有未保存的更改')}
          </span>
          {errorMessage ? (
            <span className="text-xs text-kumo-danger">{errorMessage}</span>
          ) : null}
        </div>

        <div className="ms-2 flex shrink-0 items-center gap-2">
          <Button variant="destructive" size="sm" onClick={onReset} disabled={saving}>
            {labels?.reset ?? t('unsavedChanges.reset', '重置')}
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
            {labels?.save ?? t('unsavedChanges.save', '保存')}
          </Button>
        </div>
      </div>
    </div>
  )
}
