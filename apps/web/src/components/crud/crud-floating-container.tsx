import { Button, LayerDialog } from '@cloudflare/kumo'
import { ArrowsOutIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
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
  const lastActiveTypeRef = useRef(crud.activeView.type)

  const { activeView } = crud

  // 1. 挤压分屏 (split) 或抽屉 (sheet) 时与 useDetailPreview 联动
  useEffect(() => {
    if (activeView.type === 'floating-form' && activeView.floatingType === 'split') {
      openPreview({
        key: `crud-form-${activeView.mode}-${activeView.id ?? 'create'}`,
        title: activeView.title,
        description: activeView.description,
        mode: 'split',
        onExpand: crud.expandToPage,
        onClose: crud.close,
        render: ({ close }) =>
          renderForm({
            mode: activeView.mode,
            id: activeView.id,
            formId: crud.formId,
            initialData: crud.formInitialData,
            hideActions: false,
            close,
          }),
      })
      return
    }

    if (activeView.type === 'floating-detail' && renderDetail) {
      openPreview({
        key: `crud-detail-${activeView.id}`,
        title: activeView.title,
        description: activeView.description,
        mode: activeView.floatingType,
        onExpand: crud.expandToPage,
        onClose: crud.close,
        render: ({ close }) =>
          renderDetail({
            id: activeView.id,
            close,
          }),
      })
      return
    }

    if (
      lastActiveTypeRef.current !== activeView.type &&
      activeView.type !== 'floating-form' &&
      activeView.type !== 'floating-detail' &&
      isPreviewOpen
    ) {
      closePreview()
    }
    lastActiveTypeRef.current = activeView.type
  }, [activeView, crud, openPreview, closePreview, isPreviewOpen, renderForm, renderDetail])

  // 2. 居中模态弹窗 (dialog) 渲染
  if (activeView.type === 'floating-form' && activeView.floatingType === 'dialog') {
    return (
      <LayerDialog open={true} onOpenChange={(open) => !open && crud.close()}>
        <LayerDialog.Content size={dialogSize}>
          <LayerDialog.Title>
            <span className="flex items-center justify-between">
              <span>{activeView.title}</span>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                onClick={crud.expandToPage}
                aria-label={t('expand', { defaultValue: '全屏展开' })}
                title={t('expand', { defaultValue: '全屏展开' })}
              >
                <ArrowsOutIcon size={16} />
              </Button>
            </span>
          </LayerDialog.Title>
          {activeView.description ? (
            <LayerDialog.Description>{activeView.description}</LayerDialog.Description>
          ) : null}

          <LayerDialog.Body>
            {renderForm({
              mode: activeView.mode,
              id: activeView.id,
              formId: crud.formId,
              initialData: crud.formInitialData,
              hideActions: true,
              close: crud.close,
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
