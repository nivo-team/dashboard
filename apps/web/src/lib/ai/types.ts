import type { QueryClient } from '@tanstack/react-query'
import type { AiCapabilityGrant } from './capabilities'

/**
 * AI 工具层与运行时的公共类型。
 *
 * 这一层的形状**刻意与任何模型厂商 / SDK 无关**：工具就是「名字 + 描述 + JSON Schema + 一个
 * async 函数」，`ai` 包（Vercel AI SDK）只是众多可能的执行者之一。将来换运行时（或加一个
 * 走自家后端的 adapter）时，工具定义一行都不用改。
 */

/**
 * 工具占用的**能力格子** —— 见 `./capabilities`（`page:read` / `data:write` / `form:submit` …）。
 *
 * 继承自 `AiCapabilityGrant` 而不是各写一份字符串：格子键是「界面勾选」与「运行时过滤」
 * 的公共语言，任何一处写错都会让某个工具**永远发不出去**（静默失效，最难查）。
 *
 * ## 「属于哪一格」与「要不要先问」是两个维度，别揉在一起
 *
 * - 格子只回答「**能不能用**」（由用户在前端的 AI 权限里勾，后端权限点再收一道）；
 * - 「**要不要先问**」由模式（`ask` / `auto`）决定，各工具在自己的 `execute` 里读
 *   `ctx.mode` —— 见 `AiToolContext.mode`。
 *
 * 举例：`navigate_to` 占 `page:navigate`，它**不改任何数据**，所以只读档也放行；
 * 但它会把用户带离当前页面，所以询问模式下仍要用户点头。早先把「只读」与「免确认」
 * 写死在一起，于是只读档的 AI 连「带我去某页」都做不到 —— 别再退回去。
 *
 * 需要写请求的工具（`data:write` / `form:submit` / `page:operate`）必须在自己的
 * `execute` 里 `await ctx.requestApproval(...)`，拿不到明确决定一律不执行（fail-closed）。
 */
export type AiToolAccess = AiCapabilityGrant

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
 * - `custom`：只给用户在设置里勾选的那些能力格子（`aiCapabilities`，见 `./capabilities`）。
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
  /** 当前路径命中的导航项名称（最长前缀匹配），如「表格示例」 */
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
  /**
   * **按名字取本轮真正可用的工具**（`getAllowedTools` 的产物，已过权限 / 容器 / 表单 / 后端权限点）。
   *
   * `manage_tasks` 的批量执行**必须**经它解析计划里的 `action.tool`：那是模型写的字符串，
   * 万一写了一个用户没被授权的工具（例如只有 `task:plan` 却写了 `call_write_api`），
   * 那就是实打实的**提权**。取不到就是不可用 —— 这就是批量执行的白名单。
   *
   * 走这个访问器而不是让 `task-tools` 直接 import 注册表，还有一个硬理由：
   * `task-tools` ← → `tools/index` 会形成**循环 import**，模块初始化期 `AI_TOOLS`
   * 里会混进 `undefined`（真实踩到：`findTool` 在 `AI_TOOLS.find(t => t.name)` 上抛
   * `Cannot read properties of undefined`）。工具集由上下文注入，环就断了。
   */
  resolveTool: (name: string) => AiToolDefinition | undefined
  /**
   * 上报**批量任务的执行进度**（`manage_tasks` 每完成一步调一次）。
   *
   * 为什么需要它：批量计划是在**一次**工具调用内部顺序跑完的，中途不返回给模型 ——
   * 如果不主动上报，界面在整批跑完前一直是"静止"的，用户看不到步骤在推进。
   * 由 `chat.ts` 实现为写进会话 store 的 `liveTasks`，输入区的任务卡订阅它。
   */
  reportTaskProgress: (tasks: readonly TaskProgressItem[]) => void
  /**
   * 取**用户浏览器此刻的时间事实** —— 见 `AiTimeFacts`。
   *
   * 它由浏览器（而不是模型或服务端）提供，因为只有浏览器知道：用户此刻真实的本地时间、
   * 操作系统时区、以及用户在本系统「外观」里选的展示时区。模型据此把「最近 3 天」
   * 这类相对时间换算成接口需要的绝对时间戳或 ISO 串。
   */
  getTimeFacts: () => AiTimeFacts
}

/** 任务推进中的一项（`manage_tasks` 逐步上报，见 `AiToolContext.reportTaskProgress`）。 */
export interface TaskProgressItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  /** 该步的结果摘要（完成 / 失败后回填） */
  result?: string
}

/**
 * **当前时间事实** —— 由浏览器采集，供模型做相对时间换算。
 *
 * ## 为什么必须由浏览器给
 *
 * 模型的训练数据只到某个时间点，它**永远不知道"现在"**；服务端（Worker）跑在 UTC、
 * 也不知道用户装的时区。只有浏览器同时掌握三件事：
 * - `nowUtc` / `nowIso`：此刻的绝对时间（用于「最近 24 小时」这类窗口的边界计算）；
 * - `browserTimeZone`：操作系统时区（`Intl.DateTimeFormat().resolvedOptions().timeZone`）；
 * - `displayTimeZone` + 偏移标签：用户在「外观 → 时区」里选的展示时区（全站时间格式化用它）。
 *
 * ## 三个时间字段的分工（别混）
 *
 * | 字段 | 形如 | 用途 |
 * |---|---|---|
 * | `nowUtc` | `2026-10-05T08:00:00.000Z` | **给接口/后端用**：绝对时刻，与时区无关 |
 * | `nowLocal` | `2026-10-05 16:00:00` | **给人的界面看**：已在 `displayTimeZone` 下格式化 |
 * | `dayOfWeekLocal` | `星期日` | 已按展示时区换算 —— 模型自己算星期几容易错一天 |
 *
 * 接口要的多是**秒级时间戳**（如 `/user` 的 `createtime_min`），所以额外给 `nowUnixSeconds`。
 */
export interface AiTimeFacts {
  /** 绝对时刻，UTC ISO 8601（毫秒精度） */
  nowIso: string
  /** 秒级 Unix 时间戳（接口筛选参数常用这个单位） */
  nowUnixSeconds: number
  /** 绝对时刻，UTC 格式化（`YYYY-MM-DD HH:mm:ss`），不含偏移 */
  nowUtc: string
  /** 在**展示时区**下格式化的本地时间（`YYYY-MM-DD HH:mm:ss`） */
  nowLocal: string
  /** 浏览器（操作系统）时区 IANA 名，如 `Asia/Shanghai` */
  browserTimeZone: string
  /** 用户在本系统选择的展示时区 IANA 名（全站时间格式化用它） */
  displayTimeZone: string
  /** 展示时区的偏移标签，如 `GMT+8` / `UTC` */
  displayTimeZoneOffset: string
  /** 展示时区下的星期几（`星期日`…），已本地化 */
  dayOfWeekLocal: string
  /** 展示时区下的今天日期 `YYYY-MM-DD`，便于模型按"今天/昨天"取区间 */
  todayLocal: string
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
  /**
   * **Catalog 阶段**给模型看的一句话 —— 只说明「这个工具能干什么」。
   *
   * 建议 10~25 个中文字。**不要**在这里写：调用规则、权限、其它工具、业务流程，
   * 也不要复述 system prompt —— 那些属于执行阶段的 `description` 与各层提示词。
   *
   * 为什么单独留一条：Router 阶段要把**当前权限下全部可用**的工具摆给模型做选择，
   * 而 `description` + `inputSchema` 的全量体量约 1.7 万字符，不可能每轮都发；
   * 发这条一句话（约 10~25 字）就够了 —— 完整定义只在 Execution 阶段按需下发。
   */
  catalogDescription: string
  /**
   * 依赖的其它工具名 —— 被选中时 Runtime 会**自动补齐**它们（见 `resolveTools`）。
   *
   * 例：`analyze_data` 依赖 `get_page_data`（要先拿到数据源 id 与字段注解）。
   * 补依赖是 Runtime 的确定性职责，模型不必记住工具之间的依赖关系。
   */
  dependencies?: readonly string[]
  /**
   * 是否参与 Router 阶段的 Catalog（默认 `true`）。
   *
   * `false` = 不出现在给模型的清单里，但仍可被依赖补齐 / 被选中（真值只有本定义一处）。
   */
  catalog?: boolean
  /**
   * 是否允许进入 Execution Agent（默认 `true`）。
   *
   * `false` = 即使被选中也会被 `resolveTools` 过滤掉 —— 给「只在 Router 阶段存在」的
   * 辅助工具留位置（例如 `select_tools` 自己就不该进执行阶段）。
   */
  execution?: boolean
  inputSchema: Record<string, unknown>
  /**
   * 这个工具占用的**能力格子**（`page:read` / `data:write` / `form:submit` …）。
   *
   * 它就是「这一项由哪个勾选放行」的答案：设置页勾上这个格子 → 运行时把这个工具交给模型。
   * 格子键的清单（以及每一格放行到什么程度）在 `./capabilities`，**不要**在这里另立枚举。
   */
  capability: AiToolAccess
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
   * 消息创建时间（0 时区 UTC ISO 8601 格式，如 2026-10-05T08:00:00.000Z）。
   * 随会话落盘存储，展示时经由统一时间格式化工具转换。
   */
  createdAt?: string
  /**
   * 当前消息状态：流式中、成功或失败。
   */
  status?: 'streaming' | 'success' | 'error'
  /** 失败时的错误信息摘要 */
  error?: string
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
 * 一轮对话的 **token 与工具选择日志** —— 「按需加载」到底省没省、省在哪一段，只能靠它验证。
 *
 * 两阶段的输入量差距极大（Router 只有分诊 + 目录，Execution 才有操作规约 + 完整 schema），
 * 所以**必须分段记录**：只看总数会把"Router 便宜"与"某次选了很多工具"混成一个数字。
 *
 * 生产环境默认只 `console.info` 一行（见 `chat.ts`）；不上报、不落库。
 */
export interface AiTurnMetrics {
  /** Router 阶段（选工具）的输入 / 输出 token */
  routerInputTokens: number
  routerOutputTokens: number
  /** Execution 阶段（真正执行）的输入 / 输出 token */
  executionInputTokens: number
  executionOutputTokens: number
  /** 两阶段合计 */
  totalInputTokens: number
  totalOutputTokens: number
  /** Router 选中的工具（模型给的、且真实存在且当前可用） */
  selectedTools: string[]
  selectedToolCount: number
  /** Runtime 依据 `dependencies` 自动补上的工具 */
  addedDependencies: string[]
  /** 当前权限 / 容器下可用的工具总数 —— Router 做选择的**范围** */
  availableToolCount: number
  /** 真正下发给 Execution 的完整工具数（它们的 schema 才是执行阶段的开销） */
  executionToolCount: number
  /** 被丢掉的选择（不存在 / 越权 / 非执行工具），供排查 Router 选错 */
  rejectedTools: string[]
  /**
   * Router 判定的本轮**意图**（`select_tools.intent`）—— `null` 表示没走 Router。
   *
   * 它目前只进日志（用于下一步按画像加载与压缩 Prompt）；Runtime 不拿它做业务判断。
   */
  intent: string | null
  /** Router 是否**没选工具**（直接回答或纯问候）—— 这条为 true 时 Execution 阶段不存在 */
  routerAnsweredDirectly: boolean
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
