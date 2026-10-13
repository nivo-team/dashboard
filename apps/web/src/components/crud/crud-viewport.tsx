import { CrudViewContainer } from './crud-view-container'
import { CrudFloatingContainer } from './crud-floating-container'
import type {
  CrudDetailSlotProps,
  CrudFormSlotProps,
  CrudViewportProps,
} from './types'

/**
 * 统一 CRUD 视窗调度组件（CrudViewport）。
 *
 * 核心职责：
 * 1. 状态自动化分流：根据 `crud.isPageMode` 与 `activeView` 自动在整页与浮层之间切换调度；
 * 2. 渲染阻断保护：进入整页模式（`isPageMode`）时自动阻断 `children` 列表的渲染与请求；
 * 3. 单一真值插槽：业务方仅需声明一次 `renderForm` 与 `renderDetail`，自适应覆盖整页、弹窗、分屏三种形态；
 * 4. 按钮策略决策：浮层 Dialog 下自动注入 `hideActions: true` 由底栏统一提交，整页与分屏下注入 `hideActions: false` 由表单自身承载提交按钮。
 */
export function CrudViewport<TFormItem = any>({
  crud,
  children,
  renderForm,
  renderDetail,
  dialogSize = 'base',
  cardClassName,
  saveLabel,
  cancelLabel,
  pageDetailWrapper = 'default',
  pageFormWrapper = 'default',
}: CrudViewportProps<TFormItem>) {
  const { activeView, isPageMode } = crud

  // 1. 命中独立整页沉浸态 (URL Path 或 view=page 触发)：阻断列表渲染
  if (isPageMode) {
    if (activeView.type === 'page-form' && renderForm) {
      const formProps: CrudFormSlotProps<TFormItem> = {
        mode: activeView.mode,
        id: activeView.id,
        formId: crud.formId,
        initialData: crud.formInitialData,
        hideActions: false, // 整页模式下必须显示内部操作按钮
        close: crud.close,
        isPage: true,
      }

      if (pageFormWrapper === 'none') {
        return <>{renderForm(formProps)}</>
      }

      return (
        <CrudViewContainer crud={crud} cardClassName={cardClassName}>
          {renderForm(formProps)}
        </CrudViewContainer>
      )
    }

    if (activeView.type === 'page-detail' && renderDetail) {
      const detailProps: CrudDetailSlotProps = {
        id: activeView.id,
        close: crud.close,
        isPage: true,
      }

      if (pageDetailWrapper === 'none') {
        return <>{renderDetail(detailProps)}</>
      }

      return (
        <CrudViewContainer crud={crud} cardClassName={cardClassName}>
          {renderDetail(detailProps)}
        </CrudViewContainer>
      )
    }

    return null
  }

  // 2. 列表浮层模式：正常渲染 children 列表，平级挂载浮层容器
  return (
    <>
      {children}

      <CrudFloatingContainer
        crud={crud}
        dialogSize={dialogSize}
        saveLabel={saveLabel}
        cancelLabel={cancelLabel}
        renderForm={(ctx) =>
          renderForm
            ? renderForm({
                ...ctx,
                hideActions: ctx.hideActions ?? false,
                isPage: false,
                isMaximized:
                  activeView.type === 'floating-form' ? activeView.isMaximized : false,
                floatingType:
                  activeView.type === 'floating-form' ? activeView.floatingType : 'dialog',
              })
            : null
        }
        renderDetail={
          renderDetail
            ? (ctx) =>
                renderDetail({
                  ...ctx,
                  isPage: false,
                  floatingType:
                    activeView.type === 'floating-detail' ? activeView.floatingType : 'sheet',
                })
            : undefined
        }
      />
    </>
  )
}
