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
      isMaximized?: boolean
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
  /** 切换当前弹窗的最大化状态（持久化至 URL view=maximized） */
  setMaximized: (maximized: boolean) => void
  /** 关闭当前表单或详情（Path 态后退回列表，Query 态清空对应参数） */
  close: () => void
  /** 从浮层形态一键平滑放大/展开至独立整页 */
  expandToPage: () => void
}

/** 统一表单插槽上下文（整页、弹窗、分屏共享该定义） */
export interface CrudFormSlotProps<TFormItem = unknown> {
  /** 当前操作模式：新建或编辑 */
  mode: 'create' | 'edit'
  /** 目标记录 ID（编辑模式下存在） */
  id?: string | number
  /** 表单 HTML id，用于与 Dialog Actions Primary 按钮跨组件关联绑定 */
  formId: string
  /** 外部传入或 AI 预填的初始数据 */
  initialData?: TFormItem | null
  /**
   * 是否隐藏表单自身的内部提交/取消按钮：
   * - 在 Dialog 浮层模式下为 true（由 Dialog 底栏统一承载按钮）；
   * - 在 Split 分屏模式与 Page 整页模式下为 false（表单自身需自备底栏按钮）。
   */
  hideActions: boolean
  /** 关闭当前视窗（自动处理 Query/Path 退出并清理） */
  close: () => void
  /** 当前是否处于独立整页沉浸态 */
  isPage: boolean
  /** 当前弹窗是否处于最大化全屏状态 */
  isMaximized?: boolean
  /** 当前激活的浮层形态（仅在浮层态下存在） */
  floatingType?: 'dialog' | 'split'
}

/** 统一详情插槽上下文（整页、抽屉、分屏共享该定义） */
export interface CrudDetailSlotProps {
  /** 目标记录 ID */
  id: string | number
  /** 关闭当前视窗 */
  close: () => void
  /** 当前是否处于独立整页沉浸态 */
  isPage: boolean
  /** 当前激活的浮层形态（仅在浮层态下存在） */
  floatingType?: 'sheet' | 'split'
}

/** 通用视窗调度组件 Props */
export interface CrudViewportProps<TFormItem = any> {
  /** CRUD 控制器实例（由 useCrudView 返回） */
  crud: CrudController<TFormItem>
  /** 主列表内容（当命中整页模式时，内部会自动阻断列表渲染与生命周期） */
  children: import('react').ReactNode
  /** 统一表单插槽（整页、弹窗、分屏共享该声明） */
  renderForm?: (props: CrudFormSlotProps<TFormItem>) => import('react').ReactNode
  /** 统一详情插槽（整页、抽屉、分屏共享该声明） */
  renderDetail?: (props: CrudDetailSlotProps) => import('react').ReactNode

  /** 弹窗尺寸，默认 'base' */
  dialogSize?: 'sm' | 'base' | 'lg'
  /** 整页表单卡片 className，默认 'max-w-2xl p-6' */
  cardClassName?: string
  /** 弹窗保存按钮文案（透传至 Dialog 模态底栏） */
  saveLabel?: string
  /** 弹窗取消按钮文案（透传至 Dialog 模态底栏） */
  cancelLabel?: string

  /**
   * 整页详情包装外壳策略：
   * - 'default' (默认)：由标准 CrudViewContainer 包裹（带标准 PageHeader 和返回按钮）；
   * - 'none'：不包裹外壳，直接渲染 renderDetail 返回的内容（适用于自带 PageHeader 与状态开关的 editable-detail 页面）。
   */
  pageDetailWrapper?: 'default' | 'none'

  /**
   * 整页表单包装外壳策略：
   * - 'default' (默认)：由标准 CrudViewContainer + LayerCard.Primary 包裹；
   * - 'none'：不包裹外壳，由 renderForm 自行控制整页外层布局。
   */
  pageFormWrapper?: 'default' | 'none'
}
