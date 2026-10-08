import { Hono } from 'hono'
import { buildSystemPrompt, buildTurnContext } from '@admin/ai-prompt'
import { normalizeFacts, resolvePromptStage } from '../facts'
import { resolveUpstream } from '../model-config'
import type { AiEnv } from '../env'

/**
 * `POST /v1/chat/completions` —— **OpenAI 兼容的透传管道**。
 *
 * 这是「像管道一样实现 SSE」的落点。前端（Vercel AI SDK）把 baseURL 指到这里之后，
 * 一条请求走完全程：
 *
 * ```text
 * 前端（messages + tools + promptFacts）
 *   → 本端点：注入服务端 system、注入上游凭证、剥离私有字段
 *   → AI Gateway（provider / 模型路由 / 重试 / 缓存 / DLP）
 *   → 厂商
 *   ← 上游响应体**原样返回**（ReadableStream 直接交出，不读、不解析、不重新编码）
 * ```
 *
 * ## 为什么是「原样返回」而不是「逐块转发」
 *
 * SSE 的每个 chunk 都要尽快到浏览器。任何「读出来再写回去」的处理都会：
 * 1. 破坏上游的分帧与时序（首 token 变慢，长回答的增量被吞）；
 * 2. 把每个 chunk 都变成一次 JS 执行 —— **CPU 时间的消耗点**，而纯透传几乎不耗
 *    （Cloudflare 明文：CPU time 不含网络等待；HTTP 请求的 wall time 无硬上限，只要客户端还连着）。
 *
 * 所以：**只要不做内容变换，就不要碰 body**。将来要脱敏时再权衡（那必须变成逐块处理，
 * 见 `.agents/docs/ai-server-layer.md` §9 与 §7）。
 *
 * ## 与前端的三条约定
 *
 * 1. **私有字段 `promptFacts`**：客户端把事实快照放在请求体的 `promptFacts` 里
 *    （与 OpenAI 请求体同层）。本端点消费后**必须删除**，否则会被发给厂商。
 * 2. **私有字段 `promptStage`**：`router` / `execution`，决定加载哪几层提示词
 *    （两阶段见 `packages/ai-prompt` 的 `PromptStage`）。同样**必须删除**；缺省按
 *    `execution` 处理，保持老前端的行为不变。
 * 3. **客户端传来的 `Authorization` 一律丢弃**：上游凭证由 Worker 注入。
 *    前端 SDK 仍需要一个非空的 `apiKey` 占位才能发请求，但它不会到达厂商。
 */

const FACTS_FIELD = 'promptFacts'
const STAGE_FIELD = 'promptStage'

export const chatRoute = new Hono<{ Bindings: AiEnv }>()

/** 只透传这些上游响应头：正文类型、缓存指令、以及 AI Gateway 的诊断头。 */
function buildPassthroughHeaders(upstream: Headers): Headers {
  const headers = new Headers()

  const contentType = upstream.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  const cacheControl = upstream.get('cache-control')
  if (cacheControl) headers.set('cache-control', cacheControl)

  // AI Gateway 的诊断头（缓存命中、DLP 命中、重试次数等）原样带给客户端，便于排查
  upstream.forEach((value, key) => {
    if (key.toLowerCase().startsWith('cf-aig-')) headers.set(key, value)
  })

  // 自述：这份响应经过服务端提示词注入（便于前端/抓包确认切换是否生效）
  headers.set('x-nivo-ai', 'system-injected')

  return headers
}

/**
 * 找最后一条 user 消息的下标 —— 本轮环境说明要插在它**之前**。
 *
 * 不用 `Array.prototype.findLastIndex`：本包的 tsconfig `lib` 是 ES2022，而它是 ES2023 才有的。
 */
function findLastUserIndex(messages: readonly unknown[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message && typeof message === 'object' && (message as { role?: unknown }).role === 'user') {
      return i
    }
  }
  return -1
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

chatRoute.post('/chat/completions', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: '请求体必须是 JSON' }, 400)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return c.json({ error: 'invalid_body', message: '请求体必须是 JSON 对象' }, 400)
  }

  const payload = raw as Record<string, unknown>

  /*
    事实快照：拼 system 的原料。缺失时 normalizeFacts 会落安全默认值（范围闸退化成"没有模块清单"
    而不是崩掉），所以这里不报错 —— 但那样提示词会明显变弱，属于"能跑但不对"。
  */
  const facts = normalizeFacts(payload[FACTS_FIELD])
  delete payload[FACTS_FIELD]

  /*
    阶段：`router`（选工具）还是 `execution`（真正执行）。两个私有字段都必须在转发前删掉，
    否则会被当成上游参数发给厂商。缺省 `execution` —— 老前端不受影响。
  */
  const promptStage = resolvePromptStage(payload[STAGE_FIELD])
  delete payload[STAGE_FIELD]

  const incoming = payload.messages
  if (!Array.isArray(incoming)) {
    return c.json({ error: 'missing_messages', message: '请求体缺少 messages 数组' }, 400)
  }

  /*
    服务端模型固定：配了 AI_MODEL_ID 就覆盖客户端传来的 model。
    provider 与路由在 AI Gateway 侧配置，前端连模型名都不需要知道。
  */
  const fixedModel = c.env.AI_MODEL_ID?.trim()
  if (fixedModel) payload.model = fixedModel

  /*
    注入分两段（**这是缓存对齐的关键，别合并回去**）：

    1. **稳定规则 → `messages[0]`**：按阶段装配 —— Router 阶段是身份 / 分诊 / 业务范围 /
     能力边界 / 回答方式 / **工具目录**；Execution 阶段在此基础上换成操作规约。
     客户端带来的 system 一律丢掉（服务端才是真值，否则两套规则会互相打架）。
  2. **本轮环境 → 对话末尾**：Router 只带页面摘要；Execution 带模式说明 / 容器策略 /
     完整页面上下文 / 任务清单。

  为什么环境必须在末尾：`system` 在 messages 最前面，它里面**任何**一处变化都会让
  它后面的一切（包括整段对话历史）失去服务商的前缀缓存 —— 历史是 token 大头，
  等于每轮都为整段历史重新付费。放进末尾之后，环境说明一旦随消息进入历史就不再变，
  下一轮的前缀仍然完整命中。

  环境说明用 `system` 角色（它是系统指令、不是用户输入）。DeepSeek 官方明确支持
  「在对话中间插入 system 消息」；若某个兼容网关不支持，把 `role` 改成 `user` 即可 ——
  落点只在这一处。
  */
  const system = buildSystemPrompt(facts, promptStage)
  const turnContext = buildTurnContext(facts, promptStage)

  const messages = incoming.filter(
    (message) =>
      !(
        message &&
        typeof message === 'object' &&
        (message as { role?: unknown }).role === 'system'
      ),
  )

  if (turnContext) {
    const lastUserIndex = findLastUserIndex(messages)
    const contextMessage = { role: 'system', content: turnContext }
    if (lastUserIndex === -1) messages.push(contextMessage)
    else messages.splice(lastUserIndex, 0, contextMessage)
  }

  payload.messages = [{ role: 'system', content: system }, ...messages]

  const upstream = resolveUpstream(c.env)
  if (!upstream.ok) {
    return c.json({ error: 'upstream_not_configured', message: upstream.reason }, 503)
  }

  let response: Response
  try {
    response = await fetch(upstream.target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // 让上游知道我们要流：大多数 OpenAI 兼容实现会据此返回 SSE
        accept: 'text/event-stream, application/json',
        ...upstream.target.headers,
      },
      body: JSON.stringify(payload),
      /*
        把入站请求的 signal 交给 fetch：浏览器一断开，上游请求随之取消，
        不会在客户端已经走掉之后还继续跑完一整个回答。
      */
      signal: c.req.raw.signal,
    })
  } catch (error) {
    return c.json(
      {
        error: 'upstream_unreachable',
        message: `上游请求失败：${describeError(error)}`,
      },
      502,
    )
  }

  /*
    **原样透传**：body 是上游的 ReadableStream，直接交给客户端。
    不要在这里 .text() / .json() / pipeThrough —— 那会破坏 SSE 增量并消耗 CPU。
  */
  return new Response(response.body, {
    status: response.status,
    headers: buildPassthroughHeaders(response.headers),
  })
})
