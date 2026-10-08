import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolveAllowedOrigin } from './cors'
import {
  maskAccountId,
  resolveChatEndpoint,
  resolveFixedModel,
  resolveUpstream,
} from './model-config'
import { REDACTION_ENABLED } from './redact'
import type { AiEnv } from './env'
import { chatRoute } from './routes/chat'
import { systemPromptRoute } from './routes/system-prompt'

/**
 * AI 中间层（Hono on Cloudflare Workers）—— **系统提示词拼接 + OpenAI 兼容透传**。
 *
 * 它在整条链路里的位置：
 *
 * ```text
 * 浏览器（Vercel AI SDK，baseURL 指向本 Worker 的 /v1）
 *    → POST /v1/chat/completions（messages + tools + promptFacts）
 *    → 本 Worker：注入 system、剥离 promptFacts、注入上游凭证
 *    → AI Gateway（provider / 模型路由 / 重试 / 缓存 / DLP）
 *    → 厂商
 * ```
 *
 * 另有 `/v1/system-prompt`（不走对话链路地取提示词，见 `routes/system-prompt.ts`）。
 *
 * 三条刻意的边界：
 * - **不落数据库**：提示词与规则就是 `@admin/ai-prompt` 的代码，改规则 = 重新部署；
 * - **不存业务数据**：请求体里的事实用完即弃，本服务不写任何持久化存储；
 * - **不信任输入**：HTTP 来的 facts 一律经 `normalizeFacts` 规范化（见 `facts.ts`）。
 */

const app = new Hono<{ Bindings: AiEnv }>()

/*
  CORS：用闭包接住带类型的 `c`，好在 origin 回调里读到 `c.env.ALLOWED_ORIGINS`。
  每次请求构造一次 handler 的开销可以忽略（它只是把配置闭包起来）。
*/
app.use('*', async (c, next) => {
  const handler = cors({
    origin: (origin) => resolveAllowedOrigin(origin, c.env.ALLOWED_ORIGINS),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    /*
      **必须覆盖 SDK 实际发出的每一个头** —— 少一个，浏览器就让整条预检失败，表现为
      「后端明明在跑，前端一个请求都发不出去」，报错形如：
      `Request header field User-Agent is not allowed by Access-Control-Allow-Headers`。

      实测（AI SDK 的 openai-compatible provider + Safari）会带：
      `content-type`、`authorization`、`accept`（SSE 流）与 `user-agent`；
      Safari 会把 `user-agent` 纳入预检（它是 forbidden header，Chrome 通常不列进来，
      所以这个坑只在 Safari 上暴露）。缓存相关头一并放行，避免换个浏览器又少一个。
      这些头本身不带权限语义 —— 真正的边界是 origin 白名单 + 上游凭证。
    */
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'User-Agent',
      'Cache-Control',
      'Pragma',
      'X-Requested-With',
    ],
    /* 让页面能读到自述头（`x-nivo-ai`）与网关诊断头，便于排查与抓包 */
    exposeHeaders: ['x-nivo-ai'],
    maxAge: 86_400,
  })
  return handler(c, next)
})

/**
 * 健康检查。
 *
 * 刻意**自述当前阶段**（`phase: 'gateway'`）与**脱敏未启用**（`redaction: false`）：
 * 这两个状态很容易被读成"已经安全了"，让它们出现在最容易被 curl 到的地方，
 * 就不会有人误判这个服务已经能兜住数据出站。
 */
app.get('/health', (c) => {
  const model = resolveFixedModel(c.env)
  const upstream = resolveUpstream(c.env)
  const base = c.env.AI_GATEWAY_BASE_URL?.trim() ?? ''
  return c.json({
    ok: true,
    service: 'nivo-ai',
    /** 能力阶段：提示词拼接 + 上游透传都已启用 */
    phase: 'gateway',
    /** 脱敏**仍未启用** —— 别把这个状态读成"已防护" */
    redaction: REDACTION_ENABLED,
    /** 鉴权**仍未启用** —— 上线前必修，否则等于公开模型额度 */
    auth: 'unverified',
    upstreamConfigured: Boolean(model.gatewayBaseUrl),
    /*
      回显「实际会打到的上游地址」（account_id 掩码）。
      **刻意只取决于 base 配没配，与凭证是否齐全无关**：凭证缺失时才最需要核对地址拼对没有
      （上游填法有好几种：`/ai/v1` 还是完整端点、有没有多余的 `/run`，配错只会得到一个难懂的 404）。
      凭证的问题单独由下面的 upstreamError 说明。
    */
    upstreamUrl: base ? maskAccountId(resolveChatEndpoint(base)) : null,
    ...(upstream.ok ? {} : { upstreamError: upstream.reason }),
    authMode: model.authMode,
    // 只报"有没有配"，绝不回显密钥本身
    hasGatewayToken: model.hasGatewayToken,
    hasProviderKey: model.hasProviderKey,
    modelId: model.modelId,
  })
})

app.route('/v1/system-prompt', systemPromptRoute)

/*
  `POST /v1/chat/completions` —— OpenAI 兼容的透传管道（注入 system → AI Gateway → 厂商）。
  前端（Vercel AI SDK）把 baseURL 指到 `/v1`，并把事实快照放进请求体的 `promptFacts` 字段。
*/
app.route('/v1', chatRoute)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  // 不把内部错误细节回显给调用方（可能带路径 / 配置片段），只在服务端日志里留一份
  console.error('[nivo-ai] unhandled error:', error)
  return c.json({ error: 'internal_error' }, 500)
})

export default app
