import type { PromptFacts, PromptStage } from '@admin/ai-prompt'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { isStepCount, jsonSchema, streamText, tool } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import { expandRouteRefs } from './route-refs'
import { resolveRecentBoundary } from './history-boundary'
import {
  getAllowedTools,
  resolveTools,
  SELECT_TOOLS_NAME,
  SELECT_TOOLS_SPEC,
  type ResolveToolsOptions,
} from './tools'
import type {
  AiAttachment,
  AiImageAttachment,
  AiImageFile,
  AiMessage,
  AiMessagePart,
  AiStreamEvent,
  AiToolContext,
  AiToolDefinition,
  AiTurnMetrics,
} from './types'

/**
 * AI 运行时：把「事实 + 工具 + 对话历史」组装成一次真实的模型调用 —— **中间层是唯一的出站口**。
 *
 * 这一层是本仓库唯一 import `ai`（Vercel AI SDK）的地方 —— 上层（UI）只消费
 * `AiStreamEvent`，下层（工具 / 上下文）是纯数据。
 *
 * **系统提示词不在这里、也不在前端拼**：它按「身份 → 范围闸 → 能力 → 工作方式 → 回答方式 → 事实」
 * 分层组装在 `packages/ai-prompt`，由 `apps/ai`（Hono Worker）在服务端拼接。
 * 本文件只负责**把事实快照随请求发出去**（`promptFacts`），拿回来的结果原样交给上层。
 * 规则要改 → 改服务端那侧；**别再往前端搬回来**。
 *
 * 三个刻意的选择：
 * - **不引 zod**：工具输入用 JSON Schema（`jsonSchema()`），与仓库其它地方的运行时
 *   schema 同一套描述方式，也少一个依赖。
 * - **不引 `@ai-sdk/react`**：面板的 UI 是自定义的（工具卡片、审批卡），
 *   自己消费 `fullStream` 比套 `useChat` 的消息模型更直接。
 * - **不问模型能力**：具体模型（以及它支不支持工具调用 / 思考）由 `apps/ai` 与 AI Gateway
 *   决定，前端不配、也拿不到；工具是否随请求发出只由**权限**决定（见 `chat.ts` 的
 *   `getAllowedTools`），不再有第二道「模型不支持」的收窄。
 */

/** 一次用户提问最多允许几轮工具调用（提高至 30 轮以支持多任务连续推进与规划执行）。 */
export const MAX_TOOL_STEPS = 30

/**
 * 中间层地址。默认指向本地 `pnpm -C apps/ai dev`（3002）；生产用 `.env` 里的
 * `VITE_AI_SERVICE_BASE_URL` 覆盖。
 */
const AI_SERVICE_BASE_URL =
  ((import.meta.env?.VITE_AI_SERVICE_BASE_URL as string | undefined) ?? '').replace(
    /\/+$/,
    '',
  ) || 'http://localhost:3002'

/**
 * 发给中间层的 model 占位。
 *
 * 真实模型由 Worker 固定（`AI_MODEL_ID`）并**覆盖**这个值 —— 前端不需要、也不应该知道
 * 网关上的模型名（那是 AI Gateway 的配置）。这里刻意用一个不存在的名字：万一服务端漏配了
 * `AI_MODEL_ID`，请求会得到一个明确的 404，而不是悄悄用了错模型。
 */
const WORKER_MODEL_ID = 'nivo-ai-server-fixed'

/**
 * 指向 AI 中间层的模型端点。
 *
 * 走中间层之后，前端**不再关心哪家 provider**：
 * - **凭证**由 Worker 注入（这里的 `apiKey` 只是 SDK 的必填占位，不会到达厂商）；
 * - **系统提示词**由 Worker 拼接（本层不再传 `system`）；
 * - **provider / 模型路由**在 AI Gateway（Worker 侧配置）。
 *
 * 事实快照必须随**每一个**请求发出（包括工具循环里的每一轮），因为服务端是无状态的、
 * 每轮都要重新拼提示词。AI SDK 没有"自定义请求体字段"的入口，所以用自定义 `fetch`
 * 在最外层把 `promptFacts` 并进请求体 —— 这是本项目**唯一一处**改写出站请求体的地方。
 *
 * `getStage` 是两阶段的接点：SDK 每一步都会调用 `prepareStep`，我们把当前阶段记在闭包里，
 * 这里读出来放进 `promptStage` —— 服务端据此决定加载哪几层提示词。
 */
function createWorkerModel(
  promptFacts: PromptFacts,
  getStage: () => PromptStage = () => 'execution',
) {
  return createOpenAICompatible({
    name: 'nivo-ai',
    baseURL: `${AI_SERVICE_BASE_URL}/v1`,
    apiKey: 'injected-by-worker',
    fetch: async (input, init) => {
      if (init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>
          body.promptFacts = promptFacts
          body.promptStage = getStage()
          return fetch(input, { ...init, body: JSON.stringify(body) })
        } catch {
          // 不是 JSON 体就不动它（例如 SDK 偶发的探测请求）
        }
      }
      return fetch(input, init)
    },
  })(WORKER_MODEL_ID)
}

/**
 * 把仓库自己的工具定义转成 AI SDK 的工具。
 *
 * `inputSchema` 用 `jsonSchema()` 包一层：我们的定义是纯 JSON Schema，不需要 zod；
 * 这里的断言只是为了跨过 SDK 的 `JSONSchema7` 名义类型，schema 本身没做任何变换。
 */
function toSdkTools(
  definitions: readonly AiToolDefinition[],
  ctx: AiToolContext,
): ToolSet {
  const entries = definitions.map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: jsonSchema(
        definition.inputSchema as Parameters<typeof jsonSchema>[0],
      ),
      execute: async (input: unknown) =>
        definition.execute(input as Record<string, unknown>, ctx),
    }),
  ])

  return Object.fromEntries(entries) as ToolSet
}

export interface StreamAssistantTurnOptions {
  /** 对话历史（不含本轮用户消息时，请先把它 append 进去再调用） */
  messages: readonly ModelMessage[]
  /**
   * 本轮**事实快照** —— 随请求发给中间层，由它拼系统提示词。
   *
   * 规则（身份 / 范围闸 / 能力 / 工作方式 / 回答方式）**不在这里**：那是服务端唯一的真值。
   * 两阶段各取其中一部分（Router 用页面摘要 + 工具目录，Execution 用完整页面上下文）。
   */
  promptFacts: PromptFacts
  /**
   * 工具策略（权限 / 容器 / 表单 / 后端权限点）—— Runtime 的**唯一**过滤输入。
   *
   * Router 阶段用它算「当前可选范围」（与页面上的权限清单同源），
   * Execution 阶段用它把 Router 的选择解析成实际下发的工具集（`resolveTools`）。
   */
  toolPolicy: ResolveToolsOptions
  toolContext: AiToolContext
  abortSignal?: AbortSignal
  /**
   * 一轮结束后的 token / 工具选择日志（可选）。
   *
   * 只做观测：拿不到就只是少一条日志，不影响这一轮。
   */
  onMetrics?: (metrics: AiTurnMetrics) => void
}

/**
 * 从 `navigate_to` 的返回值里认领「全屏建议卡」的载荷。
 *
 * 约定：全屏分支返回 `{ proposed: { path, label, reason? } }`（见 `tools/page-tools.ts`）。
 * 这里只做**形状校验** —— 认不出来就什么都不做（结果照常作为 `tool-result` 交给模型），
 * 绝不因为多出一个字段就让整条事件流变形。
 */
function readNavigationProposal(
  output: unknown,
): { path: string; label: string; reason?: string } | null {
  if (!output || typeof output !== 'object') return null
  const proposed = (output as { proposed?: unknown }).proposed
  if (!proposed || typeof proposed !== 'object') return null

  const { path, label, reason } = proposed as {
    path?: unknown
    label?: unknown
    reason?: unknown
  }
  if (typeof path !== 'string' || !path) return null

  return {
    path,
    label: typeof label === 'string' && label ? label : path,
    ...(typeof reason === 'string' && reason ? { reason } : {}),
  }
}

/**
 * 流式 <think> 标签解析器：
 * 兼容市面上大量将思维链包裹在 <think>...</think> 中通过普通文本流返回的模型（如 DeepSeek-R1、Ollama、第三方聚合 API），
 * 自动将其无缝提升为标准 reasoning 流式事件，使思考折叠卡片在各种渠道下均能稳定生效。
 */
class ThinkTagStreamParser {
  private inThink = false
  private buffer = ''

  feed(text: string): AiStreamEvent[] {
    this.buffer += text
    const events: AiStreamEvent[] = []

    while (this.buffer.length > 0) {
      if (!this.inThink) {
        const openIdx = this.buffer.indexOf('<think>')
        if (openIdx === -1) {
          const partialMatch = this.buffer.match(/<t?(h?(i?(n?k?)?)?)?$/)
          if (partialMatch && partialMatch[0].length > 0) {
            const emitLen = this.buffer.length - partialMatch[0].length
            if (emitLen > 0) {
              events.push({ type: 'text', text: this.buffer.slice(0, emitLen) })
              this.buffer = this.buffer.slice(emitLen)
            }
            break
          } else {
            events.push({ type: 'text', text: this.buffer })
            this.buffer = ''
            break
          }
        } else {
          if (openIdx > 0) {
            events.push({ type: 'text', text: this.buffer.slice(0, openIdx) })
          }
          this.inThink = true
          this.buffer = this.buffer.slice(openIdx + 7)
        }
      } else {
        const closeIdx = this.buffer.indexOf('</think>')
        if (closeIdx === -1) {
          const partialMatch = this.buffer.match(/<\/?t?(h?(i?(n?k?)?)?)?$/)
          if (partialMatch && partialMatch[0].length > 0) {
            const emitLen = this.buffer.length - partialMatch[0].length
            if (emitLen > 0) {
              events.push({ type: 'reasoning', text: this.buffer.slice(0, emitLen) })
              this.buffer = this.buffer.slice(emitLen)
            }
            break
          } else {
            events.push({ type: 'reasoning', text: this.buffer })
            this.buffer = ''
            break
          }
        } else {
          if (closeIdx > 0) {
            events.push({ type: 'reasoning', text: this.buffer.slice(0, closeIdx) })
          }
          this.inThink = false
          this.buffer = this.buffer.slice(closeIdx + 8)
        }
      }
    }

    return events
  }

  flush(): AiStreamEvent[] {
    if (this.buffer.length === 0) return []
    const events: AiStreamEvent[] = [
      {
        type: this.inThink ? 'reasoning' : 'text',
        text: this.buffer,
      },
    ]
    this.buffer = ''
    return events
  }
}

/**
 * 「工具调用被写成文本」的标记 —— 必须兜住的一类模型行为。
 *
 * 正常路径下工具调用走**结构化 `tool_calls`**（SDK 解析 → `select_tools.execute` → 执行阶段）。
 * 实测存在另一种形态：模型把调用**写进正文**（DeepSeek 的 `<||DSML|| …>` 标记、某些模型的
 * `<function_calls>`、或直接写 `select_tools(...)`）。这时 SDK 拿不到任何 tool call，
 * 整轮会被当成"普通回答"结束 —— 用户看到一段 XML、页面毫无反应（真实踩到）。
 *
 * 这里只负责**认出**它；处置在 `streamAssistantTurn` 里（Router 缓冲 + 强制重试一次）。
 */
const TOOL_CALL_LEAK_PATTERNS: readonly RegExp[] = [
  /<\|\|?\s*DSML\s*\|\|?/i,
  /<\|tool[\u2581_ ]?calls?\|>/i,
  /<\|?function[\u2581_ ]?calls?\|?>/i,
  /"name"\s*:\s*"select_tools"/,
  /\bselect_tools\s*[[({]/,
]

/** 返回文本里**最早的**泄漏标记位置（`-1` = 没有泄漏）。 */
function findToolCallLeak(text: string): number {
  let earliest = -1
  for (const pattern of TOOL_CALL_LEAK_PATTERNS) {
    const at = text.search(pattern)
    if (at >= 0 && (earliest === -1 || at < earliest)) earliest = at
  }
  return earliest
}

/**
 * 跑一轮助手回复，把流式事件抛给调用方。
 *
 * 用 async generator 而不是回调：调用方用 `for await` 消费，天然支持中途 `break`
 * （用户点「停止」），也不用自己管订阅与取消。
 *
 * 工具循环由 SDK 负责（`stopWhen: isStepCount(...)`）—— 每次工具返回后它会自动
 * 带着结果再问一次模型，直到没有新的工具调用或到达步数上限。
 */
export async function* streamAssistantTurn(
  options: StreamAssistantTurnOptions,
): AsyncGenerator<AiStreamEvent> {
  /*
    ── 两阶段（Router → Execution）────────────────────────────────────────────
    一次 `streamText`、一条 HTTP 流，但**每一步发给模型的东西不同**：

    | step | 阶段 | 提示词（服务端按 `promptStage` 选层） | 模型能看到的工具 |
    |---|---|---|---|
    | 0 | router | 分诊 / 范围 / 能力 / 回答方式 + **工具目录**（一行一句话） | 只有 `select_tools` |
    | ≥1 | execution | 上面那些 + 操作规约 + **完整页面上下文** | `select_tools` 选中的（含依赖补齐） |

    于是「你好」这类请求只付目录与分诊的钱，不必把 18 个工具的完整 schema 发出去；
    而工具循环、审批、流式事件全部不变（仍由 SDK 与本层驱动）。
  */

  /*
    当前可选范围：与设置页的权限清单**同一份过滤**（权限 / 容器 / 表单 / 后端权限点）。
    Router 的目录文本由 `chat.ts` 生成（事实采集在那边），这里再算一次只为日志与兜底 ——
    纯内存过滤，成本可忽略。
  */
  const availableTools = getAllowedTools(
    options.toolPolicy.permission,
    options.toolPolicy.customTools,
    {
      hasForms: options.toolPolicy.hasForms,
      surface: options.toolPolicy.surface,
      permissions: options.toolPolicy.permissions,
    },
  )

  /*
    阶段状态：`createWorkerModel` 的 fetch 在每个请求前读它，`prepareStep` 在每一步前写它。
    两者配对，服务端据此决定加载哪几层提示词。
  */
  let stage: PromptStage = 'router'

  /** Router 的选择结果；`null` = 还没选过（模型可能直接回答了） */
  let selection: ReturnType<typeof resolveTools> | null = null

  /** Router 判定的意图（只进日志；Runtime 不据它做业务判断） */
  let intent: string | null = null

  /** 执行阶段的 `activeTools`（空数组 = 这一步不给任何工具，模型只能直接回答） */
  let executionToolNames: string[] = []

  /** 分阶段 token 记账（由 `onStepFinish` 累计） */
  const tokens = {
    routerInput: 0,
    routerOutput: 0,
    executionInput: 0,
    executionOutput: 0,
  }

  const selectToolsSdk = tool({
    description: SELECT_TOOLS_SPEC.description,
    inputSchema: jsonSchema(
      SELECT_TOOLS_SPEC.inputSchema as Parameters<typeof jsonSchema>[0],
    ),
    execute: async (input: unknown) => {
      const raw = (input ?? {}) as { tools?: unknown; intent?: unknown }
      intent = typeof raw.intent === 'string' ? raw.intent.trim() : null
      const names = Array.isArray(raw.tools)
        ? raw.tools.filter((name): name is string => typeof name === 'string')
        : []
      /*
        **Runtime 的确定性解析**：模型给的名字不可信 —— 不存在的丢掉、当前不可用的丢掉、
        声明的依赖自动补齐（见 `resolveTools`）。执行阶段只认这一份结果。
      */
      selection = resolveTools(names, options.toolPolicy)
      executionToolNames = selection.tools.map((item) => item.name)
      /*
        回给模型的结果**只讲事实**（加载了哪些、哪些没加载、为什么没加载）：
        - `unsupported`：注册表里根本没有这个能力（**不要**说成"权限没开"）；
        - `permission_denied`：能力在，但当前权限 / 容器 / 表单条件不满足。
        措辞与系统提示词「能力边界」层严格对应，模型据此如实回答。
        这段会被拼进下一步请求，所以刻意只说两三个词，不写成第二份提示词。
      */
      const dropped = selection.rejected.map((item) => ({
        name: item.name,
        reason: item.reason === 'unknown' ? 'unsupported' : 'permission_denied',
      }))
      return {
        loaded: executionToolNames,
        ...(dropped.length > 0 ? { dropped } : {}),
      }
    },
  })

  /*
    ── Router 文本缓冲 ────────────────────────────────────────────────────────
    为什么要在 Router 阶段扣住文本：模型偶尔会把工具调用**写成正文**（见
    `TOOL_CALL_LEAK_PATTERNS`）—— 那种情况下整轮不产生任何 tool call，直接流出去就是
    "用户看到一段 XML、页面毫无反应"。所以 Router 的文本先缓冲，step 结束时再决定：
    有 tool call 就发前言、判定为泄漏就丢弃并**强制重试一次**、正常回答才照常发出。
    执行阶段的流式**不受影响**（不缓冲）。
  */
  let routerBuffer = ''
  /** Router 这一步是否真的产生了结构化 tool call */
  let routerSawToolCall = false
  /** Router 是否把调用写成了文本（强制重试一次的判据） */
  let routerLeaked = false
  /** 执行阶段文本的副本 —— 只为观测"又被写成文本"，不参与输出、不做缓冲 */
  let executionText = ''

  async function* runOnce(forceRouterTool: boolean): AsyncGenerator<AiStreamEvent> {
    stage = 'router'
    routerBuffer = ''
    routerSawToolCall = false
    routerLeaked = false
    executionText = ''
    /* 重试要重新选一次：不要沿用上一轮的残留 */
    selection = null
    executionToolNames = []
    intent = null

    const result = streamText({
      model: createWorkerModel(options.promptFacts, () => stage),
      messages: [...options.messages],
      /*
        工具定义**全部注册**（Router 工具 + 业务工具），再用 `activeTools` 按步收窄 ——
        SDK 在组装每一步的请求前会先 `filterActiveTools`，只有 active 的那些才真正发给模型。
        这是「按需加载 schema」能成立的关键：不必把一轮对话拆成两次调用。
      */
      tools: {
        [SELECT_TOOLS_NAME]: selectToolsSdk,
        ...toSdkTools(availableTools, options.toolContext),
      },
      activeTools: [SELECT_TOOLS_NAME],
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0) {
          stage = 'router'
          /*
            正常路径用 `auto`（纯问候可以直接回答）；**只有重试**时才用 `required` ——
            上一次模型把调用写成了文本，这一次必须走结构化工具通道。
          */
          return forceRouterTool
            ? { activeTools: [SELECT_TOOLS_NAME], toolChoice: 'required' as const }
            : { activeTools: [SELECT_TOOLS_NAME] }
        }
        /*
          第 1 步起是执行阶段：`select_tools` 已经在这个 step 开始前执行过，
          `executionToolNames` 就是 Runtime 解析后的结果（可能是空数组 = 本轮不需要工具）。
        */
        stage = 'execution'
        return { activeTools: executionToolNames }
      },
      onStepFinish: (step) => {
        const usage = step.usage
        /*
          用 `stepNumber` 判断阶段（而不是读 `stage`）：少一个对"SDK 先 onStepFinish
          还是先 prepareStep"的隐含依赖 —— 第 0 步永远是 Router。
        */
        if (step.stepNumber === 0) {
          tokens.routerInput += usage?.inputTokens ?? 0
          tokens.routerOutput += usage?.outputTokens ?? 0
        } else {
          tokens.executionInput += usage?.inputTokens ?? 0
          tokens.executionOutput += usage?.outputTokens ?? 0
        }
      },
      /*
        步数预算 **+1**：第 0 步是 Router（选工具），执行阶段的工具循环仍应拿到原来的 30 步
        —— 否则两阶段改造会悄悄少掉一轮工具调用。
      */
      stopWhen: isStepCount(MAX_TOOL_STEPS + 1),
      abortSignal: options.abortSignal,
    })

    const thinkParser = new ThinkTagStreamParser()

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          if (part.text) {
            /* Router 阶段的文本先缓冲，由 step 结束时的 `finish-step` 决定处置 */
            if (stage === 'router') {
              routerBuffer += part.text
              break
            }
            /*
              执行阶段的文本照常流式输出；另留一份副本只为**观测**「工具调用被写成文本」
              （见 `finish-step`）—— 那时文本已经在用户眼前了，收不回来，但日志要留下线索。
            */
            executionText += part.text
            for (const ev of thinkParser.feed(part.text)) {
              yield ev
            }
          }
          break
        case 'reasoning-delta': {
          const text =
            (part as { text?: string; delta?: string }).text ??
            (part as { delta?: string }).delta ??
            ''
          if (text) {
            console.debug('[Reasoning Delta Received]', text)
            yield { type: 'reasoning', text }
          }
          break
        }
        case 'tool-call':
          /*
            `select_tools` 是**内部协议**（Router 的交付通道），不是业务动作 ——
            不往会话里落卡片：用户看到的应该是"AI 去查数据了"，而不是一张选工具的卡。
          */
          if (String(part.toolName) === SELECT_TOOLS_NAME) break
          for (const ev of thinkParser.flush()) yield ev
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: String(part.toolName),
            input: part.input,
          }
          break
        case 'tool-result': {
          if (String(part.toolName) === SELECT_TOOLS_NAME) break
          yield {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: String(part.toolName),
            output: part.output,
          }
          /*
            全屏容器里 `navigate_to` **不会真跳**，返回的是一份 `proposed` 建议（见
            `tools/page-tools.ts`）—— 在这里翻成 `nav-proposal` 流式事件，由 store 落成
            消息里的建议卡。这样工具层仍是「纯函数 + 返回值」，不必知道会话里哪条消息、
            哪个 part；渲染层也只认事件，不认工具实现。
          */
          const proposal = readNavigationProposal(part.output)
          if (proposal) yield { type: 'nav-proposal', ...proposal }
          break
        }
        case 'tool-error':
          /* 与 tool-call 同理：内部协议的失败不往会话里落卡片 */
          if (String(part.toolName) === SELECT_TOOLS_NAME) break
          yield {
            type: 'tool-error',
            toolCallId: part.toolCallId,
            toolName: String(part.toolName),
            error: part.error,
          }
          break
        case 'error':
          yield { type: 'error', error: part.error }
          break
        /*
          Router 步刚结束：决定缓冲区里的文本怎么处置。
          - 有 tool call → 只发"前言"（泄漏段一并切掉，避免露出半截 XML）；
          - 没有 tool call 但文本里有调用标记 → 判定泄漏：丢弃，交给外层强制重试；
          - 其他 → 照常发出（纯问候 / 纯翻译这类 Router 直接回答的场景）。
        */
        case 'finish-step': {
          if (stage !== 'router') {
            /*
              执行阶段的观测：这里的文本**已经流到用户眼前了**，收不回来，
              所以不重试（重试还可能重放已经执行过的写操作）—— 只留一条告警，
              让"模型又把调用写成了文本"在日志里有据可查。
            */
            if (findToolCallLeak(executionText) >= 0) {
              console.warn(
                '[ai:execution] 模型把工具调用写成了文本；该步内容已输出、未自动重试，请人工确认这一轮是否真的执行了动作',
              )
            }
            executionText = ''
            break
          }
          const leakAt = findToolCallLeak(routerBuffer)
          if (routerSawToolCall) {
            const usable = (leakAt >= 0 ? routerBuffer.slice(0, leakAt) : routerBuffer).trim()
            if (usable) yield { type: 'text', text: usable }
          } else if (leakAt >= 0) {
            routerLeaked = true
          } else if (routerBuffer.trim()) {
            yield { type: 'text', text: routerBuffer }
          }
          routerBuffer = ''
          break
        }
        case 'finish': {
          /*
            带上 token 用量 —— `cacheReadTokens` 是「提示词拼接是否对齐」的唯一客观指标：
            任何一处「不该变却变了」（时间戳、随机顺序、历史被改写）都会让它掉下来。
            SDK 已把各厂商不同的字段名归一化到 `inputTokenDetails`，这里不需要分支。
          */
          const usage = part.totalUsage
          yield {
            type: 'finish',
            usage: {
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens,
              noCacheTokens: usage?.inputTokenDetails?.noCacheTokens,
            },
          }
          break
        }
        default:
          // 其余 part（reasoning / source / step 边界等）本期不呈现
          break
      }
    }

    for (const ev of thinkParser.flush()) {
      yield ev
    }

  }

  /*
    正常就一轮；只有 Router 判定为"工具调用被写成文本"时才强制重试一次
    （重试用 `tool_choice: 'required'`，逼它走结构化通道）。重试仍失败就明确报错 ——
    绝不再把那段 XML 当成回答交给用户。
  */
  for await (const ev of runOnce(false)) yield ev
  if (routerLeaked) {
    console.warn(
      '[ai:router] 模型把 select_tools 调用输出成了文本，已强制重试一次（tool_choice=required）',
    )
    for await (const ev of runOnce(true)) yield ev
    if (routerLeaked) {
      yield {
        type: 'error',
        error: new Error(
          '模型没有按工具协议发起调用（把调用写成了文本），本次没能执行；请重试一次或换个说法。',
        ),
      }
    }
  }

  /*
    一轮结束：把 token 账与工具选择交出去（`onMetrics` 可选，缺省只是少一条日志）。
    这里读的是**累计值** —— Router 步通常 1 步，Execution 可能多步（工具循环）。
    `selection === null` 表示 Router 直接回答了（本轮没有执行阶段）。
  */
  const finalSelection: ReturnType<typeof resolveTools> | null = selection
  options.onMetrics?.({
    routerInputTokens: tokens.routerInput,
    routerOutputTokens: tokens.routerOutput,
    executionInputTokens: tokens.executionInput,
    executionOutputTokens: tokens.executionOutput,
    totalInputTokens: tokens.routerInput + tokens.executionInput,
    totalOutputTokens: tokens.routerOutput + tokens.executionOutput,
    selectedTools: finalSelection?.selected ?? [],
    selectedToolCount: finalSelection?.selected.length ?? 0,
    addedDependencies: finalSelection?.addedByDependency ?? [],
    availableToolCount: availableTools.length,
    executionToolCount: finalSelection?.tools.length ?? 0,
    rejectedTools: finalSelection?.rejected.map((item) => item.name) ?? [],
    routerAnsweredDirectly: finalSelection === null,
    intent,
  })
}

/** 工具结果统一转成文本再回给模型：不用 JSON 分支，省掉 JSONValue 的类型体操。 */
function stringifyToolOutput(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : String(value)
  } catch {
    return String(value)
  }
}


/** 衰减后的占位。必须说明「可以重调」，否则模型会把占位当成数据本身。 */
const OMITTED_TOOL_RESULT =
  '[历史轮次的结果已省略以节省上下文；需要这些数据请重新调用该工具。]'


/**
 * 把面板的消息模型转成 SDK 的消息模型。
 *
 * 三条规则（写错任何一条模型都会「失忆」或报错）：
 * 1. 用户消息合并成一段文本；
 * 2. 助手的文本与**工具调用**放在同一条 `assistant` 消息里；
 * 3. 工具结果必须作为紧跟其后的**独立 `tool` 消息**（不能塞回 assistant 里）。
 *
 * 只有 `state === 'done'` 的工具调用才会带上结果 —— 执行失败 / 被打断的调用不能进历史，
 * 否则下一轮模型会拿到一个没有对应结果的 tool-call。
 */
/** data URL → 裸 base64：SDK 的 `FilePart` 把「字节」与「媒体类型」拆成两个字段 */
function dataUrlToBase64(url: string): string {
  const comma = url.indexOf(',')
  return comma === -1 ? url : url.slice(comma + 1)
}

export function toModelMessages(messages: readonly AiMessage[]): ModelMessage[] {
  const result: ModelMessage[] = []

  /*
    衰减点按**阶梯**前进（不是每轮前移一位）—— 它决定「哪些更早的工具结果走占位」。
    边界稳定 = 前缀稳定 = 缓存能命中，理由见 `resolveRecentBoundary` 的注释。
  */
  const recentBoundary = resolveRecentBoundary(messages)

  for (const [index, message] of messages.entries()) {
    /*
      用户消息里的 `@` 引用（`@table-example:1234`）在这里**追加**一段「模块 / 页面 / 路径」的说明，
      见 `#/lib/ai/route-refs`。**只对 user 消息做**：`@` 是用户打出来的约定，
      助手自己复述一句「你可以用 @table-example」不该被当成引用；而且展开要用当前页面的 appId，
      套到别的应用的历史消息上只会给出一段错的路径。
    */
    const rawText = message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('')
      .trim()

    if (message.role === 'user') {
      const text = expandRouteRefs(rawText)
      /*
        附件（见 `AiAttachment`）+ 旧存档里可能残留的 `image` part，分两类走：
        - **图片** → AI SDK v7 的 `FilePart`（`{ type: 'file', mediaType, data }`；旧的 `ImagePart`
          在该版本已 deprecated，新代码不要再用）。`data` 收**裸 base64**、媒体类型单独一个字段，
          所以这里把 data URL 的前缀拆掉；
        - **文本文件**（md / txt，内容已在客户端解析好）→ 用 `<file>` 包成文本块拼进**同一条**
          user 消息：这样任何厂商都能读，不依赖它对文档格式的支持。
        文本与图片放进同一条消息 —— 拆成两条会被部分厂商当成两轮输入。
      */
      const attachmentParts = message.parts.filter(
        (
          part,
        ): part is
          | Extract<AiMessagePart, { type: 'attachment' }>
          | Extract<AiMessagePart, { type: 'image' }> =>
          part.type === 'attachment' || part.type === 'image',
      )

      if (attachmentParts.length === 0) {
        if (text) result.push({ role: 'user', content: text })
        continue
      }

      const fileBlocks = attachmentParts
        .filter(
          (part): part is Extract<AiAttachment, { kind: 'text' }> & {
            type: 'attachment'
          } => part.type === 'attachment' && part.kind === 'text',
        )
        .map((file) => `<file name="${file.name}">\n${file.text}\n</file>`)
        .join('\n\n')
      const promptText = [text, fileBlocks].filter(Boolean).join('\n\n')

      const images = attachmentParts.filter(
        (
          part,
        ): part is
          | ({ type: 'image' } & AiImageAttachment)
          | ({ type: 'attachment' } & AiImageFile) =>
          part.type === 'image' || (part.type === 'attachment' && part.kind === 'image'),
      )

      const content: Array<Record<string, unknown>> = []
      if (promptText) content.push({ type: 'text', text: promptText })
      for (const image of images) {
        content.push({
          type: 'file',
          mediaType: image.mediaType,
          ...(image.name ? { filename: image.name } : {}),
          data: dataUrlToBase64(image.url),
        })
      }

      if (content.length === 0) continue
      result.push({ role: 'user', content } as unknown as ModelMessage)
      continue
    }

    const calls = message.parts.filter(
      (part): part is Extract<AiMessagePart, { type: 'tool-call' }> =>
        part.type === 'tool-call' && part.state === 'done',
    )

    /*
      下面两处 `as unknown as ModelMessage` 是刻意的：SDK 的 content 类型是
      `string | Array<各 part 联合>`，而这里构造的是**确定形状**的对象数组，
      标注成联合类型反而要塞一堆 part 类型体操（`AssistantContent` 并未从 `ai` 导出）。
      结构正确性由上面的过滤条件保证：只有 `state === 'done'` 的调用才会进历史，
      文本与工具调用的字段也逐个对齐了 API 契约。
    */
    const assistantContent: Array<Record<string, unknown>> = []
    /*
      回传思考内容 —— **这不是可选项**：
      DeepSeek 官方要求「携带了 `tools` 的请求，后续所有请求必须**完整回传** `reasoning_content`，
      否则返回 400」（未携带 tools 时它会被忽略，所以一律回传是安全的）。
      `@ai-sdk/openai-compatible` 在构造请求时会把 reasoning part 拼成 `reasoning_content`
      字段，所以这里只需要把它放进 assistant 内容，**不用手写那个字段**。
    */
    for (const part of message.parts) {
      if (part.type === 'reasoning' && part.text) {
        assistantContent.push({ type: 'reasoning', text: part.text })
      }
    }
    if (rawText) assistantContent.push({ type: 'text', text: rawText })
    for (const call of calls) {
      assistantContent.push({
        type: 'tool-call',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      })
    }
    if (assistantContent.length > 0) {
      result.push({
        role: 'assistant',
        content: assistantContent,
      } as unknown as ModelMessage)
    }

    const toolContent = calls.map((call) => ({
      type: 'tool-result',
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: {
        type: 'text',
        value:
          index >= recentBoundary
            ? stringifyToolOutput(call.output)
            : OMITTED_TOOL_RESULT,
      },
    }))
    if (toolContent.length > 0) {
      result.push({ role: 'tool', content: toolContent } as unknown as ModelMessage)
    }
  }

  return result
}
