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
 *   `navigate_to` 只是移动视角，「看哪里」不是「改什么」，所以只读档同样给。
 *   ⚠️ **只读 ≠ 免确认**：跳转仍归 `read`，但它会把用户带离当前页面，所以默认**要用户确认**
 *   （面板弹确认卡、全屏落建议卡，见 `AiApprovalRequest` 的 `navigate` 形态与
 *   `NAVIGATION_GRANT`）。「属于哪一档」与「要不要先问」是两个维度，别揉在一起；
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
 * AI 此刻跑在**哪个容器**里 —— 面板（分屏 / 浮窗）还是全屏对话页。
 *
 * 为什么要把它做成一个显式维度：同一句话在两个容器里的代价完全不同。
 * 面板挂在 `AppShell` 上、路由切换不影响它，所以「带用户去某页」是顺手的一步
 * （左边表格、右边 AI）；而全屏页**本身就是一个页面**，跳走等于把用户从对话里拽出去。
 *
 * 因此容器决定两件事，且**只在两处收口**（别在工具或渲染处各判一次）：
 * - 提示词的「工作方式」层（服务端 `packages/ai-prompt`）：面板鼓励带路、全屏默认不跳；
 * - 工具清单（`getAllowedTools(..., { surface })`）：全屏没有挂载的页面，
 *   `update_search_params` 这类"只对当前页面成立"的工具不发给模型。
 *
 * 它**由渲染处显式传入**（`AiComposer` 的 `surface` prop），不要用路由字符串反推 ——
 * 手写的路由匹配会在某次重命名后静默失配。
 */
export type AiSurface = 'panel' | 'sphere'

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
  /** 匹配到的路由模板，如 `/$appId/system/menus/$featureId` */
  routePath: string | null
  /** 当前路径命中的导航项名称（最长前缀匹配），如「用户列表」 */
  navLabel: string | null
  /** 页面标题（`<h1>` 文本），取不到为 null */
  title: string | null
}

/**
 * 用户在卡片上的决定 —— **必须是三态**，别退回布尔。
 *
 * - `deny`：拒绝（工具抛错，模型改用别的做法）；
 * - `once`：**只放行这一次** —— 不写任何授权，下次同样的动作还会再问
 *   （「带我去」/「允许一次」就是这个语义）；
 * - `session`：放行**并记住**：写会话级授权（`NAVIGATION_GRANT` / 工具名），
 *   本会话内同样的动作不再询问（刷新即失效）。
 *
 * 为什么不能只用 `boolean + remember`：布尔那次实现里"允许一次"也会往内存授权表里
 * 塞一条，于是**标签写着一 次、行为却是本会话** —— 三态把这个洞堵上了。
 */
export type AiApprovalDecision = 'deny' | 'once' | 'session'

/**
 * 一次「请用户确认」的请求 —— **写操作与跳转共用这一条通道**。
 *
 * 两种形态（判别联合，`kind` 缺省表示 `action`，旧调用点不用改）：
 * - `action`：写操作 / 走审批的表单动作。`input` 原样展示（用户要看清到底要发什么）；
 * - `navigate`：**跳转**。不再展示原始 JSON（`{"path":"…"}` 对用户没有意义），
 *   改为展示**目标页面名 + 路径 + 理由**，按钮是「带我去 / 本会话自动跳转 / 先不跳」。
 *
 * 两种形态在 `chat.ts` 里是**同一条 Promise 通道**：用户在卡片上点了才继续。
 */
export type AiApprovalRequest =
  | {
      kind?: 'action'
      /** 发起请求的工具名（同时用于「本会话内不再询问」的授权键） */
      toolName: string
      /** 工具输入，原样展示给用户 */
      input: unknown
      /** 为什么需要确认 */
      reason?: string
    }
  | {
      kind: 'navigate'
      /**
       * 授权键 —— 跳转用 `NAVIGATION_GRANT`（`'navigate'`）而不是工具名：
       * 用户同意的是「这个会话里可以带我去页面」这项**能力**，与工具实现无关。
       */
      toolName: string
      /** 目标路径（站内绝对路径） */
      path: string
      /** 目标页面的可读名字（来自导航清单，取不到时退化成路径） */
      label: string
      /** 为什么要去（给用户的一句上下文，可选） */
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
  /** 当前容器（面板 / 全屏）—— 决定「跳转」怎么落地（确认卡 vs 建议卡），见 `AiSurface` */
  surface: AiSurface
  /**
   * 「自动跳转」是否已开（设置 → AI，默认关）。
   *
   * 它**只在面板的询问模式下**起作用：开了之后跳转连确认卡都不弹。
   * **自动模式不需要它**（自动模式 = 始终允许，直接跳）；全屏容器也不读它
   * （那里永远是建议卡，跳转由用户点卡片触发）。
   */
  autoNavigate: boolean
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
  /**
   * 本轮用户消息的**原始文本** —— `check_result_match` 用它校验"探测值必须来自用户"。
   *
   * 这是枚举攻击的主要护栏：模型可以自造正则去二分，但不能自造一个**用户没说过的值**。
   */
  getUserMessageText: () => string
  /**
   * 递增并返回本会话某个工具的调用计数 —— `check_result_match` 的限流用它。
   * 计数随会话走（新建 / 切换会话归零），**不落盘**。
   */
  bumpToolCounter: (key: string) => number
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
  /**
   * 必须**全部**具备的权限点（AND）。空 / 不声明 = 人人可用（例如纯上下文工具）。
   *
   * 权限点来自后端（`#/lib/permissions`），与页面能力 / 页面指令是**同一套命名**。
   */
  requiredPermissions?: readonly string[]
  /**
   * 至少具备**其一**（OR）；支持 `*` 通配（`*:read` = 任一模块的读权限）。
   *
   * 通用通道（`call_read_api` / `call_write_api`）只能声明到这一层 —— 它们具体打哪个
   * 接口由模型决定，无法预先声明精确权限点；更细的校验在**执行时**按目标接口所属模块做，
   * 最终由后端按用户身份兜底。
   */
  requiredPermissionsAny?: readonly string[]
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
  /**
   * 这一轮的 token 用量（只有 assistant 消息有）。
   *
   * 存下来是为了**能看见缓存有没有命中** —— 它是判断「提示词拼接是否对齐」的唯一客观依据，
   * 也是「做过的缓存优化到底有没有效果」的唯一验证手段。随会话落盘（IDB）。
   */
  usage?: AiTurnUsage
}

export type AiMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'reasoning'
      text: string
      state: 'streaming' | 'done'
    }
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
   * **全屏容器里的跳转建议卡**（非阻塞）。
   *
   * 面板里跳转走的是阻塞审批卡（`pendingApproval`，用户不点这一轮就停在那儿）；
   * 全屏里刻意相反：AI 不等待 —— 它一边把数据就地渲染出来、一边把这张卡留在消息里，
   * 用户想去看真正的页面时再点。于是「全屏可以直接把业务做完」这条路是通的，
   * 而卡片的 `state` 会跟着点击落盘（刷新后卡片还在，点了还能用）。
   */
  | {
      type: 'nav-proposal'
      /** 卡片自己的 id（会话里可能有多张，点击时要认领到具体这一张） */
      id: string
      path: string
      label: string
      reason?: string
      state: 'pending' | 'accepted' | 'dismissed'
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
 * 一轮的 token 用量 —— 只留我们真正会看的几项。
 *
 * `cacheReadTokens` 是**前缀缓存是否对齐的唯一客观指标**：提示词里任何一处「不该变却变了」
 * 都会让它掉下来（详见 `.agents/docs/ai-server-layer.md` §7.5 / §7.6）。
 *
 * 字段取自 AI SDK 归一化后的 `LanguageModelUsage.inputTokenDetails` —— 各厂商原始字段名
 * 完全不同（DeepSeek `prompt_cache_hit_tokens`、Anthropic `cache_read_input_tokens`、
 * OpenAI `input_tokens_details.cached_tokens`），**SDK 已经把它们映射到同一个形状**，
 * 所以上层不必按厂商分支。
 */
export interface AiTurnUsage {
  inputTokens?: number
  outputTokens?: number
  /** 命中前缀缓存的输入 token —— 越大越好（命中价约为未命中的 1/10 ~ 1/50） */
  cacheReadTokens?: number
  /** 未命中缓存的输入 token */
  noCacheTokens?: number
}

/**
 * 运行时向外抛的事件流。
 *
 * UI 只认这个联合类型，不碰 AI SDK 的 `fullStream` part —— 将来换运行时
 * （或加一个走自家后端的通道）时，面板代码一行都不用改。
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: unknown }
  /**
   * 全屏容器里 `navigate_to` 的返回被运行时翻成这条事件 → store 落成 `nav-proposal` part。
   *
   * 为什么要经过一次翻译而不是让工具直接写 store：工具是**纯函数 + 返回值**，
   * 它不该知道「会话里哪条消息、哪个 part」；把"输出 → UI part"这一步收在运行时，
   * 工具层与渲染层就不必互相认识（换运行时也不用改工具）。
   */
  | { type: 'nav-proposal'; path: string; label: string; reason?: string }
  | { type: 'error'; error: unknown }
  /** 一轮结束 —— 带上 token 用量（含前缀缓存命中），供 UI / 调试观察拼接线是否对齐 */
  | { type: 'finish'; usage?: AiTurnUsage }
