import type { QueryClient } from '@tanstack/react-query'

/**
 * AI 工具层与运行时的公共类型。
 *
 * 这一层的形状**刻意与任何模型厂商 / SDK 无关**：工具就是「名字 + 描述 + JSON Schema + 一个
 * async 函数」，`ai` 包（Vercel AI SDK）只是众多可能的执行者之一。将来换运行时（或加一个
 * 走自家后端的 adapter）时，工具定义一行都不用改。
 */

/**
 * 工具的权限等级 —— **由工具自己声明**。
 *
 * - `read`：只读 —— **不改数据，也不改页面上的内容**。**导航属于这一档**：
 *   `navigate_to` 只是移动视角，「看哪里」不是「改什么」，所以只读档同样给；
 * - `act`：改变**页面上的内容**（目前只有填表），但不产生持久数据；
 * - `commit`：发起写请求（POST/PUT/DELETE、提交表单）—— 在自己的 `execute` 里
 *   `await ctx.requestApproval(...)`，用户点了「允许」才真正发请求；
 *   拿不到明确决定一律不执行（fail-closed）。
 *
 * **它不决定「能不能用」**：可用性由设置里的 AI 权限（`full` / `readonly` / `custom`）
 * 决定（见 `getAllowedTools`）；**要不要审批**由模式决定（见 `AiToolContext.mode`）。
 * 权限与模式是**正交**的两个维度 —— 早先把 `act` / `commit` 写死成「只有 auto 可用」，
 * 那让 `ask` 变成了一个连表都填不了的模式。
 */
export type AiToolAccess = 'read' | 'act' | 'commit'

/**
 * 工具在权限界面里的分组。
 *
 * 设置页按它折叠、显示计数；它同时是「AI 到底能做什么」对人解释时的归类 ——
 * 用户勾权限时面对的是「数据 4 项 / 表单 3 项」，不是一串工具名。
 */
export type AiToolGroup = 'page' | 'data' | 'form'

/** 与输入面板的模式一一对应（见 `#/lib/store` 的 `AiComposerMode`）。 */
export type AiMode = 'ask' | 'auto'

/**
 * AI 权限三档（设置 → AI 的「AI 权限」）。
 *
 * - `full`：全部工具；
 * - `readonly`：只给 `read` 类；
 * - `custom`：只给用户在设置里勾选的那些（`aiAllowedTools`）。
 *
 * 它与 `AiMode` **正交**：权限回答「**能不能用**」，模式回答「**用起来要不要问**」。
 * 默认是 `readonly` —— AI 默认只能看，要动数据得用户自己去开。
 */
export type AiPermissionMode = 'full' | 'readonly' | 'custom'

/**
 * 当前页面上下文 —— AI 用来「知道自己在哪」。
 *
 * 每次请求都**重新采集**（用户可能已经导航过了），而不是在会话开始时取一次。
 */
export interface AiPageContext {
  /** 完整 URL（含 search / hash）：管理后台的路由本身编码了「在看什么」，这是最关键的资源 */
  url: string
  pathname: string
  search: string
  appId: string | null
  appName: string | null
  /** 匹配到的路由模板，如 `/$appId/system/features/$featureId` */
  routePath: string | null
  /** 当前路径命中的导航项名称（最长前缀匹配），如「用户列表」 */
  navLabel: string | null
  /** 页面标题（`<h1>` 文本），取不到为 null */
  title: string | null
}

/**
 * 一次「请用户确认」的请求 —— `commit` 类工具在执行前必须发起它。
 *
 * 三个字段都是**给人看的**：`input` 会原样展示（用户要能看清到底要发什么），
 * `reason` 是给审批人补的一句上下文（例如「这是删除操作」）。
 */
export interface AiApprovalRequest {
  /** 发起请求的工具名（同时用于「本会话内不再询问」的授权键） */
  toolName: string
  /** 工具输入，原样展示给用户 */
  input: unknown
  /** 为什么需要确认 */
  reason?: string
}

/** 工具执行时拿到的能力集合 —— 全部由 React 侧注入，见 `#/lib/ai/shell-bridge`。 */
export interface AiToolContext {
  queryClient: QueryClient
  /**
   * 当前输入模式（`ask` / `auto`）—— 工具的**审批策略**看它。
   *
   * `ask` 下，凡是"替用户做主"的动作都先问一句；`auto` 下能直接做的就直接做：
   * - `fill_form`：ask 要过审批，auto 直接填；
   * - `submit_form`：ask 一律确认；auto 只要表单自己说可以提交（`canSubmit()`），
   *   就不再弹确认 —— 那正是「信息足够」的可判定表达；
   * - `call_write_api`：**两个模式都要确认**（通用写接口没有可预览的表单，不给自动）。
   *
   * 注意它与「权限」是两件事：**权限决定有没有这个工具，模式决定用起来要不要问**。
   */
  mode: AiMode
  /** 客户端路由跳转（保留 SPA 行为，不要用 `location.assign`） */
  navigate: (to: string) => void
  getPageContext: () => AiPageContext
  /**
   * 请求用户确认，返回 `false` 表示被拒绝。
   *
   * **`commit` 类工具必须在真正发请求之前 `await` 它**，而且拿到 `false` 要直接抛错
   * （让模型知道「用户不同意，别重试」），不要静默跳过 —— 否则模型会以为操作成功了。
   * 实现由 `chat.ts` 提供：把请求交给 UI，拿回一个 Promise。
   */
  requestApproval: (request: AiApprovalRequest) => Promise<boolean>
}

/**
 * 一个工具的定义。
 *
 * `inputSchema` 直接用 **JSON Schema**（不是 zod）：工具输入本来就该是纯数据描述，
 * 这样也能把它原样展示给用户看（「AI 打算这样调用」），少一个运行时依赖。
 */
export interface AiToolDefinition<Input = Record<string, unknown>> {
  /** 给模型的唯一名字，蛇形命名 */
  name: string
  /** 给模型看的用途说明 —— 写清楚「什么时候该用它」，模型是否用对全靠这句话 */
  description: string
  inputSchema: Record<string, unknown>
  access: AiToolAccess
  /** 权限界面里的分组（页面 / 数据 / 表单）：设置页按它折叠、计数 */
  group: AiToolGroup
  execute: (input: Input, ctx: AiToolContext) => Promise<unknown>
}

/**
 * 会话里的一条消息。
 *
 * 这是**面板的渲染模型**，刻意与 AI SDK 的 `ModelMessage` 分开：
 * 前者要带着「工具跑到哪一步了」这类 UI 状态（`state`），后者只关心发给模型的内容。
 * 两者之间的转换收在运行时的 `toModelMessages()` 里。
 *
 * 会话**不持久化**（与面板展开状态一致）：AI 对话是「临时看一眼」的上下文，
 * 刷新就从零开始；需要跨会话保留的是配置。
 */
export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  parts: AiMessagePart[]
}

export type AiMessagePart =
  | { type: 'text'; text: string }
  | ({ type: 'attachment' } & AiAttachment)
  /**
   * @deprecated 早期只支持图片时写进会话存档的 part。
   * **只读兼容**（新消息一律写 `attachment`）：旧会话里的图因此还能预览、还能继续发给模型。
   */
  | ({ type: 'image' } & AiImageAttachment)
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      input: unknown
      /** running = 正在执行（UI 显示进行中），done / error 为终态 */
      state: 'running' | 'done' | 'error'
      output?: unknown
      error?: string
    }

/**
 * 图片附件：以 **data URL** 表示（UI 直接 `src` 预览，IndexedDB 也只存字符串）。
 * 发给模型时拆成 base64 + `mediaType`，作为 AI SDK v7 的 **`FilePart`**（见 `runtime.toModelMessages`）。
 */
export interface AiImageFile {
  kind: 'image'
  url: string
  /** IANA 媒体类型（`image/png` …），发送时是必填字段 */
  mediaType: string
  /** 原始文件名。可以没有：粘贴来的截图就没有名字 */
  name?: string
  /** 字节数，只用于在卡片上显示大小 */
  size: number
}

/**
 * 文本附件（**目前只收 Markdown / 纯文本**）。
 *
 * 内容**在客户端就解析好**（`File.text()`）随消息当文本发出去 —— 不走 `FilePart` 的二进制上传：
 * 这样任何厂商都能读，不依赖它对文档格式的支持（也躲开了各家对 PDF / Office 解析的差异）。
 */
export interface AiTextFile {
  kind: 'text'
  name: string
  size: number
  /** 解析出来的纯文本内容 */
  text: string
}

export type AiAttachment = AiImageFile | AiTextFile

/** @deprecated 只给 `AiMessagePart` 的 `image` 分支用（旧存档兼容），新代码用 `AiAttachment` */
export interface AiImageAttachment {
  url: string
  mediaType: string
  name?: string
}

/**
 * 运行时向外抛的事件流。
 *
 * UI 只认这个联合类型，不碰 AI SDK 的 `fullStream` part —— 将来换运行时
 * （或加一个走自家后端的通道）时，面板代码一行都不用改。
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: unknown }
  | { type: 'error'; error: unknown }
  | { type: 'finish' }
