import { Input, LayerDialog } from '@cloudflare/kumo'
import { useEffect, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyableValue } from '#/components/copyable-value'

/**
 * 危险操作的二次确认弹窗（通用）。
 *
 * 与 Kumo 官方 `DeleteResource` 的差别：后者把确认输入框、资源类型、按钮文案都写死成一套
 * 固定的排版与措辞，样式偏重；这里只保留核心的防误操作机制，视觉完全走 Kumo 语义令牌，
 * 文案与描述都由调用方传入，因此任何模块的删除/停用等不可逆操作都能复用。
 *
 * 防误操作的关键：**必须原样输入 `confirmationText` 才能点亮确认按钮**（前后空白忽略），
 * 目标文本旁边带一键复制，避免用户照着长名字手敲出错。
 */

export interface DangerConfirmDialogLabels {
  /** 输入提示的前半句，默认「请输入」。 */
  hint?: string
  /** 输入提示的后半句，默认「以确认：」。 */
  suffix?: string
  /** 确认输入框的无障碍名称。 */
  inputAria?: string
}

interface DangerConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 弹窗标题，例如「删除功能」。 */
  title: string
  /** 风险说明（建议是富文本，把目标对象加粗强调）。 */
  description: ReactNode
  /** 必须原样输入才能确认的内容，例如资源名称。 */
  confirmationText: string
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 取消按钮文案，默认「取消」。 */
  cancelLabel?: string
  /** 确认操作进行中 */
  loading?: boolean
  /** 操作失败信息（就地展示） */
  errorMessage?: string | null
  onConfirm: () => void
  labels?: DangerConfirmDialogLabels
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmationText,
  confirmLabel,
  cancelLabel,
  loading = false,
  errorMessage,
  onConfirm,
  labels,
}: DangerConfirmDialogProps) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  /** 表单 id：同一页面可能同时挂载多个确认弹窗，Actions 靠 HTML `form` 属性关联，必须唯一。 */
  const formId = useId()

  // 每次打开都从空开始：避免上一次输入残留导致"看起来已经确认过"
  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matched = typed.trim() === confirmationText.trim()

  /**
   * 点击确认按钮（或焦点在按钮上回车）走这里：按钮是下面表单的 submit 按钮。
   * 输入框内的回车由 `Input` 自己的 `onKeyDown` 处理，那条路径会 `preventDefault()`
   * 阻止隐式提交，因此两条路径不会重复触发一次确认。
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!matched || loading) return
    onConfirm()
  }

  /** 输入框内回车：不依赖浏览器的表单隐式提交规则，直接判定。 */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!matched || loading) return
    onConfirm()
  }

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange} dismissDisabled={loading}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>

        <LayerDialog.Body>
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-kumo-default">
              <span>{labels?.hint ?? t('dangerConfirm.hint', '请输入')}</span>
              <CopyableValue text={confirmationText} />
              <span>{labels?.suffix ?? t('dangerConfirm.suffix', '以确认：')}</span>
            </div>

            <Input
              aria-label={labels?.inputAria ?? t('dangerConfirm.inputAria', '确认输入')}
              placeholder={confirmationText}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={loading}
              autoComplete="off"
            />

            {errorMessage ? (
              <p className="text-sm text-kumo-danger" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </form>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={cancelLabel ?? t('dangerConfirm.cancel', '取消')}>
          {/*
            用 `form` 属性关联 Body 内的表单（而不是 onClick）：点击按钮、以及焦点在按钮上回车，
            都统一走表单提交；输入框内的回车另走 `Input` 的 `onKeyDown`。
            不要再加 onClick，否则点击会提交两次。
          */}
          <LayerDialog.Actions.Primary
            form={formId}
            type="submit"
            variant="destructive"
            disabled={!matched}
            loading={loading}
          >
            {confirmLabel}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
