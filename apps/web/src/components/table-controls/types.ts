import type { ReactNode } from 'react'
import type { QueryFilterField } from '#/api'

/**
 * 筛选字段的候选项（值 + 显示文案）。
 *
 * 只写 value 的字段在控件里会直接显示 value；
 * 需要显示「普通用户」这类文案时由调用方通过 `ResolveFilterFieldOptions` 提供（见下）。
 */
export interface FilterFieldOption {
  value: string
  label: string
}

/**
 * 把筛选字段解析成候选项（**运行时**，可跟随字典变化）。
 *
 * 返回 `undefined` 表示该字段没有动态来源，控件退回字段自带的静态 `options`
 * （生成产物里从 openapi enum 提取的那份）。用法见 `.agents/docs/dict-options.md` 的筛选一节：
 * 页面用 `useDictOptionEntries('<分类编码>')` 取字典选项，把 value + 多语言文案交给控件。
 */
export type ResolveFilterFieldOptions = (
  field: QueryFilterField,
) => readonly FilterFieldOption[] | undefined

/**
 * 字段配置项（完全扁平，对应后端返回的数据字段）
 */
export interface TableColumnItem {
  key: string
  label: string
  defaultVisible?: boolean
}

export type TableColumnValue =
  | string
  | {
      label?: string
      defaultVisible?: boolean
    }

/**
 * 扁平列定义支持对象或数组形式：
 * 形式 1: { id: 'ID', name: '名称', email: { label: '邮箱', defaultVisible: false } }
 * 形式 2: [{ key: 'id', label: 'ID' }, { key: 'name', label: '名称' }]
 */
export type TableColumnsConfig =
  | Record<string, TableColumnValue>
  | TableColumnItem[]

/**
 * 扩展显示选项项（可选，默认无）
 */
export interface TableOtherOptionItem {
  key: string
  label: string
  defaultValue?: boolean
}

export type TableOtherOptionValue =
  | string
  | {
      label?: string
      defaultValue?: boolean
    }

/**
 * 扩展显示选项支持对象或数组形式：
 * 形式 1: { showFullName: 'Show full name' }
 * 形式 2: [{ key: 'showFullName', label: 'Show full name', defaultValue: true }]
 */
export type TableOtherOptionsConfig =
  | Record<string, TableOtherOptionValue>
  | TableOtherOptionItem[]

/**
 * Display options 内部归一化后的数据格式
 */
export interface NormalizedColumnItem {
  key: string
  label: string
  defaultVisible: boolean
}

export interface NormalizedOtherOptionItem {
  key: string
  label: string
  defaultValue: boolean
}

/**
 * 列设置组件 (ColumnSettingsDropdown) Props
 */
export interface ColumnSettingsProps {
  /**
   * 方式 1：直接接入 TanStack Table 实例，作为 Table 原生插件运行
   * 自动探测可显隐列、读取列名、同步显示状态，并调用 table.resetColumnVisibility()
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table?: any

  /** 方式 2：扁平结构列定义（与后端字段一一对应，不绑定 table 时使用） */
  columns?: TableColumnsConfig
  /** 当前各列可见性状态 */
  columnVisibility?: Record<string, boolean>
  /** 列可见性变更回调 */
  onColumnVisibilityChange?: (visibility: Record<string, boolean>) => void

  /** 可选的扩展设置组（例如 Other -> Show full name 等），默认无 */
  other?: TableOtherOptionsConfig
  /** 当前扩展选项状态 */
  otherVisibility?: Record<string, boolean>
  /** 扩展选项变更回调 */
  onOtherVisibilityChange?: (other: Record<string, boolean>) => void

  /** 重置至初始默认状态的回调 */
  onReset?: () => void
  /** 是否已处于默认状态（用于控制 Reset 按钮禁用态） */
  isDefault?: boolean
  /** 触发器按钮显示文字，缺省时取 i18n 的 table.displayOptions.trigger */
  triggerLabel?: string
  /** 列过滤输入框提示文字，缺省时取 i18n 的 table.displayOptions.filterPlaceholder */
  searchPlaceholder?: string
}

/**
 * 搜索输入框 Props
 */
export interface SearchControlProps {
  value: string
  onChange: (value: string) => void
  onSearch?: (value: string) => void
  onClear?: () => void
  placeholder?: string
  ariaLabel?: string
  /** 表单字段名，缺省 'search'：供浏览器自动填充与表单语义识别 */
  name?: string
  /** 输入框 id，缺省由组件自动生成唯一值（便于 label 关联与测试定位） */
  id?: string
  /** 自定义样式类，会覆盖默认宽度类（默认最大 320px） */
  className?: string
  /** 自定义宽度类，优先级高于 className，同样会覆盖默认的最大 320px 宽度 */
  width?: string
}

/**
 * 高级过滤器 (FilterBuilderPopover) Props
 */
export interface FilterControlProps {
  /** 激活的筛选条件数量（大于 0 时在按钮上展示 Badge 计数） */
  activeCount?: number
  /** 触发按钮文本，缺省时取 i18n 的 table.filters.trigger */
  triggerLabel?: string
  /** Filters 弹窗内容 */
  children: ReactNode
  /** 是否受控开启 */
  open?: boolean
  /** 开启状态变更回调 */
  onOpenChange?: (open: boolean) => void
}

/**
 * 当前生效的筛选条件摘要项（用于工具栏下方的 chips 展示）
 */
export interface ActiveFilterItem {
  id: string
  /** 展示文本，例如「昵称 abc」「注册时间 2026-01-01 ~ 2026-06-30」 */
  label: string
}

/**
 * 当前条件 chips 配置：items 为空时不渲染整行
 */
export interface ActiveFiltersConfig {
  items: ActiveFilterItem[]
  /** 点击 chip 主体：打开筛选器并聚焦到该条件 */
  onEdit?: (id: string) => void
  /** 移除单个条件 */
  onRemove?: (id: string) => void
  /** 全部清除 */
  onClearAll?: () => void
}

/**
 * 右侧动作按钮区 Props
 *
 * 渲染位置：查询组之后的动作区，按断点分三档：
 * - `< sm`（640px）：动作区独占一整行（`basis-full`），并与查询组同侧起排
 *   （`justify-start`：LTR 靠左、RTL 靠右），避免被查询组挤在同一行；
 * - `sm ~ lg`：与查询组同行，紧跟其后；
 * - `≥ lg`（1024px）：左侧查询组 `flex-1` 撑满剩余空间，动作区被推到最右。
 *
 * 顺序固定为「刷新 → 导入 / 导出 / 新增 / extra」，刷新是工具型操作，始终排在动作区最前。
 */
export interface TableActionsProps {
  /**
   * 渲染在**刷新按钮右侧**的自定义内容。
   *
   * 与 `extra` 的区别只在位置：`extra` 是动作区最末尾（导入 / 导出 / 新增之后），
   * 而「新增 XX」这类主操作紧跟刷新更符合阅读顺序，用这个插槽表达。
   */
  afterRefresh?: ReactNode
  onImport?: () => void
  importLabel?: string
  onExport?: () => void
  exportLabel?: string
  onAddRecord?: () => void
  addRecordLabel?: string
  /** 自定义右侧额外操作按钮 */
  extra?: ReactNode

  /** 刷新当前页数据；传了才渲染，加载中按钮进入 loading 态 */
  onRefresh?: () => void
  refreshLoading?: boolean
  refreshLabel?: string
}

/**
 * 汇总状态栏 Props
 */
export interface TableSummaryProps {
  total?: number
  totalLabel?: ReactNode
  selectedCount?: number
  onClearSelection?: () => void
  extra?: ReactNode
}

/**
 * TableControls 根组件 Props
 */
export interface TableControlsProps {
  /**
   * 渲染在**主搜索框之后**（主搜索框与「显示选项」之间）的自定义内容。
   *
   * 用于「一个紧凑的下拉就能表达完」的筛选（如状态 1 / 2）：比再挂一个 Filters 浮层更直接；
   * 字段较多、需要区间/多选时才用 `filters`。
   *
   * 位置约定：**主搜索框永远排在查询组第一位**，本插槽只出现在它右边 ——
   * 不要把筛选控件放到搜索框左侧，那会破坏「搜索是第一个控件」的阅读顺序。
   */
  searchSuffix?: ReactNode

  /** 搜索框配置 */
  search?: SearchControlProps

  /** 高级过滤器配置（Filter 插件，可选） */
  filters?: FilterControlProps

  /**
   * 接入 TanStack Table 实例
   * 传入后，Display options 会自动作为该 Table 的列配置插件；
   * 且底部状态栏会自动读取选中行数并支持清空选择。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table?: any

  /** 列设置与扩展选项（可选，可传完整 columnSettings 或通过 table 自动配置） */
  columnSettings?: ColumnSettingsProps

  /** 配合 table 插件使用的可选扩展设置组（例如 Other -> Show full name 等），默认无 */
  otherOptions?: TableOtherOptionsConfig
  otherVisibility?: Record<string, boolean>
  onOtherVisibilityChange?: (other: Record<string, boolean>) => void

  /** 右侧操作按钮区（可选，含刷新 / 重置两个工具型操作） */
  actions?: TableActionsProps

  /** 底部汇总/状态行（可选） */
  summary?: TableSummaryProps

  /** 当前生效的筛选条件 chips（items 为空时不渲染） */
  activeFilters?: ActiveFiltersConfig

  /** 自定义容器样式类 */
  className?: string
}
