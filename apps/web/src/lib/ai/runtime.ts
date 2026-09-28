import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { isStepCount, jsonSchema, streamText, tool } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import { SUPPORTED_LOCALES, type LocaleKey } from '#/lib/locale'
import {
  getActiveModel,
  resolveProviderBaseUrl,
  type AiModelConfig,
  type AiProviderConfig,
  type AiReasoningLevel,
} from '#/lib/store'
import { formatPageContext, getPageContext } from './page-context'
import type {
  AiAttachment,
  AiMessage,
  AiMessagePart,
  AiMode,
  AiStreamEvent,
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
 * 三个刻意的选择：
 * - **不引 zod**：工具输入用 JSON Schema（`jsonSchema()`），与仓库其它地方的运行时
 *   schema 同一套描述方式，也少一个依赖。
 * - **不引 `@ai-sdk/react`**：面板的 UI 是自定义的（工具卡片、后续的审批卡），
 *   自己消费 `fullStream` 比套 `useChat` 的消息模型更直接。
 * - **模型声明不支持工具调用时**（`supportsTools === false`）不注册任何工具，
 *   退化成纯对话 —— 管理后台常见的推理 / 小模型会因为 `tools` 参数直接报错。
 */

/** 一次用户提问最多允许几轮工具调用（防止模型来回刷接口）。 */
export const MAX_TOOL_STEPS = 8

/**
 * 拼系统提示词 —— **每次请求都重新算**，不要把它缓存成常量。
 *
 * 页面上下文**每轮重新采集**并注入（而不是让模型每轮先调一次工具）：
 * 「我在哪」是每次回答都要用的信息，为它多花一次往返不划算。
 *
 * 提示词里任何**可能随权限变化**的内容都必须经过函数（当前是 `formatPageContext`
 * 与本函数的模式描述），这样才能在函数内部一处加过滤条件；往这里塞一段写死的
 * 字符串常量，等于把"过滤点"焊死 —— 上一轮就踩过：提示词里写死了"询问模式不能导航"，
 * 工具层后来放开了它，模型却照着提示词说自己没权限。
 */
function outputLanguageName(locale: LocaleKey): string {
  /*
    用**自名**（「日本語」而不是「日语」）：模型的语种知识在自名上最可靠，
    而且这样不必要求它认识当前界面语言里的语种叫法。
  */
  return SUPPORTED_LOCALES.find((item) => item.key === locale)?.nativeName ?? '简体中文'
}

export function buildSystemPrompt(mode: AiMode, outputLocale: LocaleKey): string {
  const context = getPageContext()
  const appName = context.appName ?? '管理后台'

  /*
    只描述**模式**（要不要先问用户），**绝不在提示词里复述权限**。

    权限那一维已经由「本轮实际给它的工具清单」精确表达了。再写一句"你只能读"，
    一旦权限改了而这里忘了改，模型就会**放着给它的工具不用**、反过来告诉用户
    "我没权限" —— 这个 bug 真实发生过：`navigate_to` 明明已经放进只读档，
    模型却照着旧提示词回答「我只有读取权限，不能执行页面跳转」。

    所以这里只说模式，能力边界一律交给工具清单。
  */
  const modeRule =
    mode === 'ask'
      ? '当前是「询问」模式：**动手之前先问过用户** —— 填表、提交这类会改动内容或数据的操作，系统会自动弹确认卡等你点头，用户不点就不做。**只读查询与页面跳转不需要确认，直接做。**'
      : '当前是「自动」模式：能直接做的就直接做 —— 导航、填表、以及表单校验通过后的提交，都不必再问。唯一例外是通用写接口（`call_write_api`）：系统仍会弹确认卡，那是强制的。'

  return [
    `你是「${appName}」管理后台里的 AI 助手，运行在用户自己的浏览器里。`,
    '',
    '# 当前页面上下文',
    formatPageContext(context),
    '',
    '# 你可以做的事',
    '**以本轮实际给你的工具清单为准** —— 那就是你此刻的能力边界；清单里没有的能力，你就是没有。',
    '用户要求的事如果没有对应工具，说明当前权限没开：如实说明，并告诉他可以在「设置 → AI → AI 权限」里调整。**不要**用「我是询问模式 / 只读模式所以不行」来解释 —— 模式和权限是两回事，**页面跳转在所有权限档里都可用**。',
    '',
    '# 操作前的确认',
    modeRule,
    '',
    '# 工作方式',
    '- 需要事实（数量、名称、状态、路径）时**先调用工具**，不要凭印象回答；拿不到就直说拿不到。',
    '- 用户说「带我去 / 打开某某页面」时：先 list_navigation 找到路径，再 navigate_to。',
    '- **要查数据前先 get_page_context**：它会给出当前页面用到的接口与**参数明细**（参数名 / 位置 / 是否必填）。有它就别去 search_api 里大海捞针，更**不要凭印象猜参数名** —— 猜错会被后端直接拒掉（例如把 `id` 写成 `uid`）。',
    '- **写操作被用户拒绝后不要重试同一个请求**，也不要假装它成功了 —— 如实说明被拒绝并询问下一步。',
    '- 结果里出现 `truncated: true` 说明数据被截断了，改用更精确的查询参数或分页，**不要**基于截断数据下结论。',
    `- **用${outputLanguageName(outputLocale)}回答**、先给结论再给依据（接口路径与关键数字），不要复述工具的原始返回。`,
    '- 一次只做一件明确的事；需求不清楚时先问清楚，不要连着调一堆工具乱试。',
  ].join('\n')
}

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

    case 'openai':
      return createOpenAI({ apiKey, baseURL }).chat(model.modelId)

    case 'compatible': {
      /*
        兼容类型的接口地址是**必填**（没有官方默认地址可回落，SDK 的类型也这么要求），
        缺了就明确报错 —— 让用户在设置页看到原因，而不是发一个注定失败的请求。
      */
      if (!baseURL) {
        throw new Error('OpenAI 兼容服务需要填写接口地址（设置 → AI → 模型服务）')
      }
      return createOpenAICompatible({
        name: provider.name,
        apiKey,
        baseURL,
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
  tools: readonly AiToolDefinition[]
  toolContext: AiToolContext
  /** 模型是否支持工具调用（`AiModelConfig.supportsTools`） */
  supportsTools: boolean
  abortSignal?: AbortSignal
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

  const result = streamText({
    model: createLanguageModel(active.provider, active.model),
    system: buildSystemPrompt(options.mode, options.outputLocale),
    messages: [...options.messages],
    /*
      思考程度：**AI SDK v7 的顶层可移植参数**，SDK 会按各 provider 的规范翻译成
      `reasoning_effort` / `thinking.budget_tokens` 之类。`undefined` = 省略 = 厂商默认。
      **不要**改成 `providerOptions`：两者不合并，那边一旦出现推理选项，这里会被完全忽略。
    */
    reasoning: resolveReasoning(active.model),
    // 模型不支持工具调用时传空集：既不发工具定义，也不会触发 SDK 的多步循环
    tools: useTools ? toSdkTools(options.tools, options.toolContext) : {},
    stopWhen: isStepCount(MAX_TOOL_STEPS),
    abortSignal: options.abortSignal,
  })

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        if (part.text) yield { type: 'text', text: part.text }
        break
      case 'tool-call':
        yield {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: String(part.toolName),
          input: part.input,
        }
        break
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: String(part.toolName),
          output: part.output,
        }
        break
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
    const text = message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('')
      .trim()

    if (message.role === 'user') {
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
    if (text) assistantContent.push({ type: 'text', text })
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
