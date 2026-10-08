import type {
  CapabilityAction,
  CapabilityEndpoint,
  CapabilityForm,
  CapabilitySearchParams,
} from '#/features/ai/core/page-capabilities'
import type { FormOpenOptions } from '#/features/ai/core/form-bridge'

/**
 * **页面特性（Feature）契约** —— 一个页面只声明一次。
 *
 * ## 它解决什么
 *
 * 迁移前，一个页面的 AI 能力散在四五个地方注册：`usePageCapabilities`（能力声明）、
 * `useAiFormOpener`（AI 唤起表单）、`useAiPageReload`（写后刷新）、表单组件里的
 * `useAiFormFields` / `useAiFormSubmit`，再加上 `useTableQuery` 内部注册的搜索参数桥。
 * 新人（以及 AI agent）想知道「这一页对 AI 暴露了什么」，得把这些文件全读一遍 ——
 * 更糟的是它们**没有任何一处能回答「这一页能不能删、删的时候要不要确认」**。
 *
 * 现在：**一个页面 = 一个文件夹 = 一份 `feature.ts`**（见 `.agents/docs/features-architecture.md`），
 * 里面同时写清四件事：
 *
 * | 声明 | 回答的问题 | 谁消费 |
 * | --- | --- | --- |
 * | `description` / `entities` / `endpoints` / `forms` / `searchParams` | 这一页是干什么的、用了哪些接口与表单 | `get_page_context`（面板模式不必再翻接口清单） |
 * | `permissions` | 这一页的操作需要哪些权限点 | 权限过滤（`hasPageCapabilityPermission` 一处判定） |
 * | `commands` | **AI 能在这一页做什么**（新建 / 删除 / 批量删除 / 导出…） | `run_page_command` —— 执行的是**页面自己的处理函数**（含 toast 与刷新） |
 * | `dataSources` | **这一页现在有什么数据** | `get_page_data` —— 面板模式直接读页面已加载的数据，**不用再调接口** |
 *
 * ## 三条硬约定
 *
 * 1. **不写 routeId**：注册键由 `useFeature` 从**当前路由**取（`router.state.matches.at(-1).routeId`），
 *    与 `getPageContext().routePath` 同源。手写路由字符串会在某次重命名后静默失配 —— 这是踩过的坑。
 * 2. **能力清单沿用页面能力的老形状**（`CapabilityForm` / `CapabilityEndpoint` / `CapabilitySearchParams`）：
 *    它们已经与 `get_page_context`、表单工具、权限过滤对接好了，不要在契约里长出第二套平行结构。
 * 3. **指令的执行体是页面自己的函数**（`run`），不是"再调一次接口"：
 *    页面的删除要做的不只是发请求 —— 还有 toast、表格刷新、清空选中、关弹窗。
 *    让 AI 走通用 `call_write_api` 只能改库，界面会停在旧数据上（真实踩过）。
 */

/** 指令类型：读 / 写 / 界面跳转（在页面内打开详情、表单等，不是路由跳转）。 */
export type FeatureCommandKind = 'read' | 'write' | 'navigate'

export interface FeatureCommandSpec {
  /** 指令 id（kebab-case，AI 用它调用，页面内的按钮/菜单与它一一对应） */
  id: string
  /** 给人看与给模型看的名字，如「删除用户」 */
  title: string
  /** 什么时候该用它（写清触发条件，模型用不用得对全靠这一句） */
  description?: string
  kind: FeatureCommandKind
  /**
   * 要不要先请用户确认。**缺省规则**：`write` 一律确认（页面指令是"替用户做主"的动作），
   * `read` / `navigate` 直接执行。删除这类不可撤销的动作显式写 `'always'` 并置 `destructive`。
   */
  approval?: 'auto' | 'always'
  /** 不可撤销（删除类）：审批卡上会标明 */
  destructive?: boolean
  /** 需要的权限点（如 `table-example:delete`）；判定在 `hasPageCapabilityPermission` 一处 */
  permission?: string
  /** 在页面能力的 `actions` 里怎么归类（缺省 `custom`）；只影响展示分组 */
  actionType?: CapabilityAction['type']
  /** 指令入参的 JSON Schema（给模型看；页面侧仍要自己校验） */
  inputSchema?: Record<string, unknown>
  /** ★ 执行体：**页面自己的处理函数**（复用 UI 上那颗按钮的同一段逻辑）；同步/异步都行 */
  run: (input: Record<string, unknown>) => unknown
}

/**
 * 数据源里**一个字段的注解** —— AI 写表达式、脱敏、正确计算都靠它。
 *
 * 缺了它，AI 只能从自由文本的 `shape` 里猜字段名 —— 猜错就会算出一个错数（比不给还糟）。
 */
export interface FeatureDataFieldSpec {
  /** 字段名，必须与 `read()` 返回的行里的键**完全一致** */
  name: string
  /** 给模型看的字段含义（一句话，别贴文档） */
  label: string
  /**
   * 值的类型。它决定**能做什么运算**：
   * - `number` → 可 sum / avg
   * - `datetime` → 可按区间筛
   * - `enum` → 值取自 `options`，模型不必猜数字含义
   * - `boolean` / `string` → 只能比较 / 计数
   */
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'enum'
  /** 补充说明（可选）：单位、格式、口径 */
  description?: string
  /** `type === 'enum'` 时给候选值；其它类型忽略 */
  options?: readonly { value: string | number; label: string }[]
  /**
   * **敏感字段**：AI 读到它时一律脱敏（见 §1.2）。
   *
   * 它**仍然要出现在注解里** —— 模型需要知道"有这个字段、只是看不到值"，
   * 否则连"该用 `check_result_match` 查它"都想不到。
   */
  sensitive?: boolean
}

/** 一个数据源 = 页面上"一块已经加载好的数据"（列表行、当前筛选、选中项…）。 */
export interface FeatureDataSourceSpec {
  /** 数据源 id（如 `users`），`get_page_data` 按它返回 */
  id: string
  /** 给模型看的名字，如「表格示例（当前页）」 */
  title: string
  description?: string
  /** 数据形状说明（纯文本，比 JSON Schema 更适合描述"一行有哪些字段"） */
  shape?: string
  /**
   * 这个数据源有哪些字段（字段注解）。**未注解的字段 AI 不可用** —— 宁缺勿猜。
   */
  fields?: readonly FeatureDataFieldSpec[]
  /**
   * 与数据一起给的**页面状态**（筛选关键词、分页、选中项…）。
   * 模型判断"用户问的是不是这一屏"全靠它，别省。
   */
  state?: () => Record<string, unknown>
  /** 读当前数据：**必须是纯读取**（不要在 read 里触发请求或改状态） */
  read: () => unknown
}

/** 页面特性声明 —— `defineFeature({...})` 的输入。 */
export interface FeatureSpec {
  /** 页面标题（如「表格示例」） */
  title: string
  /** 这一页是干什么的（一两句话，给模型看） */
  description: string
  /** 领域名词：帮模型把用户的口语对上这一页的概念 */
  entities?: readonly string[]
  /** 本页操作需要的权限点清单（说明性；逐项判定在 commands / forms 上） */
  permissions?: readonly string[]
  /** 本页用到的接口（参数明细由 `endpoint-specs` 自动补，**不要手写参数**） */
  endpoints?: readonly CapabilityEndpoint[]
  /** 页面上的表单（含提交接口与审批策略） */
  forms?: readonly CapabilityForm[]
  /** 页面的搜索 / 筛选 / 排序 / 分页规格 */
  searchParams?: CapabilitySearchParams
  /** ★ AI 可执行的指令 */
  commands?: readonly FeatureCommandSpec[]
  /** ★ 交给 AI 直接读的页面数据 */
  dataSources?: readonly FeatureDataSourceSpec[]
  /**
   * 重新取数（页面自己的语义：保留筛选 / 分页 / 排序）。
   * 写操作成功后由 `page-reload-bridge` 调用 —— 不登记的话，AI 改完数据界面还停在旧值。
   */
  reload?: () => unknown
  /** 打开本页的新建 / 编辑表单（AI 的 `open_form` 用） */
  openForm?: (options: FormOpenOptions) => void | Promise<void>
}
