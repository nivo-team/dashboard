/** Splat 子路径解析结果 */
export type CrudSplatMatch =
  | { type: 'create' }
  | { type: 'edit'; id: string }
  | { type: 'detail'; id: string }

/** 视窗活动形态 */
export type CrudActiveView =
  | { type: 'list' }
  | {
      type: 'page-form'
      mode: 'create' | 'edit'
      id?: string | number
      title: string
      description?: string
    }
  | {
      type: 'page-detail'
      id: string | number
      title: string
      description?: string
    }
  | {
      type: 'floating-form'
      mode: 'create' | 'edit'
      id?: string | number
      floatingType: 'dialog' | 'split'
      title: string
      description?: string
    }
  | {
      type: 'floating-detail'
      id: string | number
      floatingType: 'sheet' | 'split'
      title: string
      description?: string
    }

export interface UseCrudViewOptions {
  /** 模块根路由路径，例如 '/$appId/example/table' */
  basePath: string
  /** 当前路由捕获的 Splat 路径参数（如 undefined / 'new' / '10001' / '10001/edit'） */
  splat?: string
  /** 是否允许详情查看（若无详情查看，置为 false） */
  enableDetail?: boolean
  /** 获取表单标题与副标题元数据 */
  getFormMetadata: (
    mode: 'create' | 'edit',
    id?: string | number,
  ) => { title: string; description?: string }
  /** 获取详情标题与副标题元数据 */
  getDetailMetadata?: (id: string | number) => { title: string; description?: string }
}

export interface CrudController<TFormItem = any> {
  /** 当前解析出的活动视窗 */
  activeView: CrudActiveView
  /** 当前是否属于整页沉浸态（若为 true，背景列表一律不渲染） */
  isPageMode: boolean
  /** 当前是否属于浮层模式（若为 true，背景列表必须渲染） */
  isFloatingMode: boolean
  /** HTML 表单 id，供外部弹窗 Primary 按钮绑定提交 */
  formId: string
  /** 表单初始预填数据（供 AI open_form 或行数据预填） */
  formInitialData: TFormItem | null
  /** 设置表单初始预填数据 */
  setFormInitialData: (data: TFormItem | null) => void

  /** 主动打开新建 */
  openCreate: (initialValues?: Partial<TFormItem> | null) => void
  /** 主动打开编辑 */
  openEdit: (id: string | number, initialValues?: Partial<TFormItem> | null) => void
  /** 主动打开详情 */
  openDetail: (id: string | number) => void
  /** 关闭当前表单或详情（Path 态后退回列表，Query 态清空对应参数） */
  close: () => void
  /** 从浮层形态一键平滑放大/展开至独立整页 */
  expandToPage: () => void
}
