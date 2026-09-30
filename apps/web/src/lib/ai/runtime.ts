import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { isStepCount, jsonSchema, streamText, tool } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import type { LocaleKey } from '#/lib/locale'
import {
  getActiveModel,
  resolveProviderBaseUrl,
  type AiModelConfig,
  type AiProviderConfig,
  type AiReasoningLevel,
} from '#/lib/store'
import { buildSystemPrompt } from './prompt'
import { expandRouteRefs } from './route-refs'
import type {
  AiAttachment,
  AiMessage,
  AiMessagePart,
  AiMode,
  AiStreamEvent,
  AiSurface,
  AiToolContext,
  AiToolDefinition,
} from './types'

/**
 * AI 运行时：把「配置 + 工具 + 页面上下文」组装成一次真实的模型调用。
 *
 * 这一层是本仓库唯一 import `ai`（Vercel AI SDK）的地方 —— 上层（UI）只消费
 * `AiStreamEvent`，下层（工具 / 上下文）是纯数据。换运行时或加一条「走自家后端」的通道，
 * 只需要改这个文件。
 *
 * **系统提示词不在这里拼**：它按「身份 → 范围闸 → 能力 → 工作方式 → 回答方式 → 事实」
 * 分层组装在 `./prompt`（唯一出口 `buildSystemPrompt`），本文件只负责调用它 ——
 * 提示词要改层级、加减内容都在那边，别把规则再写回这里。
 *
 * 三个刻意的选择：
 * - **不引 zod**：工具输入用 JSON Schema（`jsonSchema()`），与仓库其它地方的运行时
 *   schema 同一套描述方式，也少一个依赖。
 * - **不引 `@ai-sdk/react`**：面板的 UI 是自定义的（工具卡片、后续的审批卡），
 *   自己消费 `fullStream` 比套 `useChat` 的消息模型更直接。
 * - **模型声明不支持工具调用时**（`supportsTools === false`）不注册任何工具，
 *   退化成纯对话 —— 管理后台常见的推理 / 小模型会因为 `tools` 参数直接报错。
 */

/** 一次用户提问最多允许几轮工具调用（提高至 30 轮以支持多任务连续推进与规划执行）。 */
export const MAX_TOOL_STEPS = 30

/**
 * 按厂商配置创建语言模型实例。
 *
 * 三家协议各有一处必须注意的地方：
 * - **OpenAI**：SDK 默认走 Responses API，而大量自建网关只实现 Chat Completions，
 *   所以这里统一用 `.chat()`（官方同样支持，兼容性最大）。
 * - **Anthropic**：浏览器直连必须带 `anthropic-dangerous-direct-browser-access` 头，
 *   否则官方 SDK 会在检测到浏览器环境时直接抛错。
 * - **OpenAI 兼容**：`createOpenAICompatible` 只认 `baseURL`，`name` 会随请求发给网关
 *   用于区分来源，填用户给厂商起的显示名即可。
 */
function createLanguageModel(
  provider: AiProviderConfig,
  model: AiModelConfig,
) {
  const baseURL = resolveProviderBaseUrl(provider) || undefined
  const apiKey = provider.apiKey || undefined

  switch (provider.kind) {
    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(model.modelId)

    case 'openai': {
      /*
        OpenAI 规范支持两种请求格式：
        - official：使用 OpenAI 官方 Responses 通道（@ai-sdk/openai，适合遵循 Responses API 规范的场景）；
        - compatible（默认推荐）：通用 Chat Completions 通道（@ai-sdk/openai-compatible，原生支持 reasoning_content，
          适用于 DeepSeek、月之暗面、通义千问、Ollama、SiliconFlow 等任意遵循 OpenAI 规范的第三方厂商）。
      */
      const format = provider.openAiFormat ?? 'compatible'
      if (format === 'official') {
        return createOpenAI({ apiKey, baseURL }).chat(model.modelId)
      }
      return createOpenAICompatible({
        name: provider.name || 'openai-compatible',
        apiKey,
        baseURL: baseURL || 'https://api.openai.com/v1',
      })(model.modelId)
    }
  }
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

/**
 * 把模型配置里的思考程度翻成传给 `streamText` 的值。
 *
 * 返回 `undefined` 的两种情况都表示**别传这个参数**：
 * - 模型没声明任何档位（`reasoningLevels` 为空）—— 它不支持推理；
 * - 选的是 `'provider-default'` —— 那正是省略参数时的行为。
 * 最后再兜一次「必须落在声明的档位里」，避免存档被手改后发出一个厂商会拒掉的值。
 */
function resolveReasoning(model: AiModelConfig): AiReasoningLevel | undefined {
  if (model.reasoningLevels.length === 0) return undefined
  if (model.reasoning === 'provider-default') return undefined
  return model.reasoningLevels.includes(model.reasoning) ? model.reasoning : undefined
}

export interface StreamAssistantTurnOptions {
  /** 对话历史（不含本轮用户消息时，请先把它 append 进去再调用） */
  messages: readonly ModelMessage[]
  /** 当前模式：决定"要不要先问用户"的说明 */
  mode: AiMode
  /**
   * AI 用什么语言回答（**已解析过的具体语言**，不是 `auto`）。
   *
   * 「跟随界面语言」那一步由调用方（`chat.ts`）解析 —— 这里只管把它写进提示词。
   */
  outputLocale: LocaleKey
  /** 当前容器（面板 / 全屏）—— 提示词按它换策略，见 `AiSurface` */
  surface: AiSurface
  tools: readonly AiToolDefinition[]
  toolContext: AiToolContext
  /** 模型是否支持工具调用（`AiModelConfig.supportsTools`） */
  supportsTools: boolean
  abortSignal?: AbortSignal
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
  const active = getActiveModel()
  if (!active) {
    throw new Error('尚未配置模型：请到 设置 → AI 添加厂商与模型。')
  }

  const useTools = options.supportsTools && options.tools.length > 0
  const reasoning = resolveReasoning(active.model)

  /*
    厂商专属思考参数适配：
    - OpenAI / Compatible: AI SDK v7 的顶层 reasoning 会自动映射为 reasoning_effort；
    - Anthropic: @ai-sdk/anthropic 需要 providerOptions.anthropic.thinking 显式开启并指定 budgetTokens；
  */
  const providerOptions: Record<string, Record<string, unknown>> = {}
  if (active.provider.kind === 'anthropic' && reasoning && reasoning !== 'none') {
    const budgetMap: Record<string, number> = {
      minimal: 1024,
      low: 2048,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
    }
    const budget = budgetMap[reasoning] ?? 4096
    providerOptions.anthropic = {
      thinking: { type: 'enabled', budgetTokens: budget },
    }
  }

  // 诊断输出：方便在控制台即时校验思考参数与模型状态
  console.debug('[AI Runtime StreamText]', {
    provider: active.provider.kind,
    modelId: active.model.modelId,
    resolvedReasoning: reasoning,
    providerOptions,
  })

  const result = streamText({
    model: createLanguageModel(active.provider, active.model),
    system: buildSystemPrompt(options.mode, options.outputLocale, options.surface),
    messages: [...options.messages],
    reasoning,
    ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    // 模型不支持工具调用时传空集：既不发工具定义，也不会触发 SDK 的多步循环
    tools: useTools ? toSdkTools(options.tools, options.toolContext) : {},
    stopWhen: isStepCount(MAX_TOOL_STEPS),
    abortSignal: options.abortSignal,
  })

  const thinkParser = new ThinkTagStreamParser()

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        if (part.text) {
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
        for (const ev of thinkParser.flush()) yield ev
        yield {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: String(part.toolName),
          input: part.input,
        }
        break
      case 'tool-result': {
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
      case 'finish':
        yield { type: 'finish' }
        break
      default:
        // 其余 part（reasoning / source / step 边界等）本期不呈现
        break
    }
  }

  for (const ev of thinkParser.flush()) {
    yield ev
  }
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

/**
 * 历史里保留**完整**工具结果的最近轮数；更早的只留一句占位。
 *
 * 工具结果是**最容易撑爆上下文**的东西：一次 `call_read_api` 可能返回几百行 JSON
 * （单条上限见 `MAX_RESULT_CHARS`），而它会跟着后面每一轮重发。
 * 但后续对话真正需要的往往只是「当时调了什么、拿到没有」—— 具体数据要再用，
 * 模型重新调一次就是。所以按轮数衰减。
 *
 * 注意保留的是：用户说过的话、助手的文本、以及**工具调用本身（名字 + 入参）** ——
 * 模型仍然知道"那一步做了什么"，只是看不到那几百行返回。
 */
const FULL_TOOL_RESULT_TURNS = 3

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

  // 从后往前数出「最近 FULL_TOOL_RESULT_TURNS 轮」的起点：它之前的工具结果会走占位
  let recentBoundary = 0
  let userTurns = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'user') continue
    userTurns += 1
    if (userTurns > FULL_TOOL_RESULT_TURNS) {
      recentBoundary = i + 1
      break
    }
  }

  for (const [index, message] of messages.entries()) {
    /*
      用户消息里的 `@` 引用（`@user:1234`）在这里**追加**一段「模块 / 页面 / 路径」的说明，
      见 `#/lib/ai/route-refs`。**只对 user 消息做**：`@` 是用户打出来的约定，
      助手自己复述一句「你可以用 @user」不该被当成引用；而且展开要用当前页面的 appId，
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
        (part) => part.type === 'image' || part.kind === 'image',
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
