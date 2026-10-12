import { Button, LayerDialog } from '@cloudflare/kumo'
import { ArrowsInIcon, ArrowsOutIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDetailPreview } from '#/components/detail-preview'
import type { CrudController } from './types'

export interface CrudFloatingFormRenderProps<TFormItem = unknown> {
  mode: 'create' | 'edit'
  id?: string | number
  formId: string
  initialData?: TFormItem | null
  hideActions?: boolean
  close: () => void
}

export interface CrudFloatingDetailRenderProps {
  id: string | number
  close: () => void
}

export interface CrudFloatingContainerProps<TFormItem = any> {
  crud: CrudController<TFormItem>
  renderForm: (props: CrudFloatingFormRenderProps<TFormItem>) => ReactNode
  renderDetail?: (props: CrudFloatingDetailRenderProps) => ReactNode
  dialogSize?: 'sm' | 'base' | 'lg'
  saveLabel?: string
  cancelLabel?: string
}

/** 弹窗右上角最大化（放大到 90% 全屏输入）/ 还原控制器 */
function DialogMaximizeButton({
  isMaximized,
  onToggle,
}: {
  isMaximized: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('common')
  const anchorRef = useRef<HTMLDivElement>(null)
  const [dialogElement, setDialogElement] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const popup = anchorRef.current.closest('[role="dialog"]') as HTMLElement | null
      if (popup) {
        setDialogElement(popup)
      }
    }
  }, [])

  useEffect(() => {
    if (!dialogElement) return
    if (isMaximized) {
      dialogElement.dataset.layerDialogMaximized = 'true'
      dialogElement.style.setProperty('max-width', '90vw', 'important')
      dialogElement.style.setProperty('width', '90vw', 'important')
      dialogElement.style.setProperty('height', '90vh', 'important')
      dialogElement.style.setProperty('max-height', '90vh', 'important')
      dialogElement.style.setProperty(
        'transition',
        'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'important',
      )
    } else {
      delete dialogElement.dataset.layerDialogMaximized
      dialogElement.style.removeProperty('max-width')
      dialogElement.style.removeProperty('width')
      dialogElement.style.removeProperty('height')
      dialogElement.style.removeProperty('max-height')
      dialogElement.style.removeProperty('transition')
    }
    return () => {
      delete dialogElement.dataset.layerDialogMaximized
      dialogElement.style.removeProperty('max-width')
      dialogElement.style.removeProperty('width')
      dialogElement.style.removeProperty('height')
      dialogElement.style.removeProperty('max-height')
      dialogElement.style.removeProperty('transition')
    }
  }, [dialogElement, isMaximized])

  const button = (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      className="absolute right-4.5 top-4 z-40 text-kumo-subtle hover:text-kumo-default"
      onClick={onToggle}
      aria-label={
        isMaximized
          ? t('restore', { defaultValue: '还原' })
          : t('maximize', { defaultValue: '全屏展开' })
      }
      title={
        isMaximized
          ? t('restore', { defaultValue: '还原' })
          : t('maximize', { defaultValue: '全屏展开' })
      }
    >
      {isMaximized ? <ArrowsInIcon size={16} /> : <ArrowsOutIcon size={16} />}
    </Button>
  )

  return (
    <>
      <div ref={anchorRef} className="hidden" aria-hidden="true" />
      {dialogElement ? createPortal(button, dialogElement) : null}
    </>
  )
}

export function CrudFloatingContainer<TFormItem = any>({
  crud,
  renderForm,
  renderDetail,
  dialogSize = 'base',
  saveLabel,
  cancelLabel,
}: CrudFloatingContainerProps<TFormItem>) {
  const { t } = useTranslation('common')
  const { open: openPreview, close: closePreview, isOpen: isPreviewOpen } = useDetailPreview()

  const { activeView } = crud
  const isMaximized = Boolean(activeView.type === 'floating-form' && activeView.isMaximized)

  const activeFloatingType = 'floatingType' in activeView ? activeView.floatingType : undefined
  const activeId = 'id' in activeView ? activeView.id : undefined
  const activeMode = 'mode' in activeView ? activeView.mode : undefined

  // 1. 挤压分屏 (split) 或抽屉 (sheet) 时与 useDetailPreview 联动
  useEffect(() => {
    if (activeView.type === 'floating-form' && activeFloatingType === 'split') {
      openPreview({
        key: `crud-form-${activeMode}-${activeId ?? 'create'}`,
        title: activeView.title,
        description: activeView.description,
        mode: 'split',
        onExpand: () => {
          crud.expandToPage()
        },
        onClose: crud.close,
        render: ({ close }) =>
          renderForm({
            mode: activeMode ?? 'create',
            id: activeId,
            formId: crud.formId,
            initialData: crud.formInitialData,
            hideActions: false,
            close: () => {
              close()
              crud.close()
            },
          }),
      })
      return
    }

    if (activeView.type === 'floating-detail' && renderDetail) {
      openPreview({
        key: `crud-detail-${activeId}`,
        title: activeView.title,
        description: activeView.description,
        mode: activeFloatingType,
        onExpand: () => {
          crud.expandToPage()
        },
        onClose: crud.close,
        render: ({ close }) =>
          renderDetail({
            id: activeId!,
            close: () => {
              close()
              crud.close()
            },
          }),
      })
      return
    }

    // 当活动视窗退出分屏/抽屉浮层时，如果侧面板仍处于开启态，必须同步关闭
    if (isPreviewOpen) {
      closePreview()
    }
  }, [
    activeView.type,
    activeFloatingType,
    activeId,
    activeMode,
  ])

  // 2. 居中模态弹窗 (dialog) 渲染
  if (activeView.type === 'floating-form' && activeView.floatingType === 'dialog') {
    return (
      <LayerDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) {
            crud.close()
          }
        }}
      >
        <LayerDialog.Content size={dialogSize}>
          <LayerDialog.Title>{activeView.title}</LayerDialog.Title>
          {activeView.description ? (
            <LayerDialog.Description>{activeView.description}</LayerDialog.Description>
          ) : null}

          <LayerDialog.Body>
            <DialogMaximizeButton
              isMaximized={isMaximized}
              onToggle={() => crud.setMaximized(!isMaximized)}
            />
            {renderForm({
              mode: activeView.mode,
              id: activeView.id,
              formId: crud.formId,
              initialData: crud.formInitialData,
              hideActions: true,
              close: () => {
                crud.close()
              },
            })}
          </LayerDialog.Body>

          <LayerDialog.Actions dismissLabel={cancelLabel ?? t('cancel', { defaultValue: '取消' })}>
            <LayerDialog.Actions.Primary form={crud.formId} type="submit">
              {saveLabel ?? t('save', { defaultValue: '保存' })}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog>
    )
  }

  return null
}
