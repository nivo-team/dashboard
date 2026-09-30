import type { AiEnv } from './env'

/**
 * 上游（AI Gateway / 厂商）与鉴权头的解析 —— **本节是「provider 与 model 配置在 AI Gateway」的落点**。
 *
 * 职责划分（见 `.agents/docs/ai-server-layer.md`）：
 *
 * | 谁 | 持有什么 |
 * |---|---|
 * | 前端 | 什么也不持有（不配 provider、不配 Key，连 model 都可以不传） |
 * | **本 Worker** | 提示词规则、**上游凭证**、上游地址 |
 * | **AI Gateway** | 具体 provider、模型路由、重试/回退、缓存、限流、DLP |
 *
 * 三种鉴权形态（不同端点形态要求不同的头，**这是最容易配错的地方**）：
 *
 * - `provider-native`：`https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/<provider>`
 *   → Cloudflare 令牌放 `cf-aig-authorization`，厂商 key 放 `Authorization`。
 *   **BYOK 场景下不要填 `AI_PROVIDER_API_KEY`** —— 网关只在厂商授权头**缺失**时才注入存好的 key；
 *   你若继续发，它会把你的值（占位符）透传，反而导致厂商鉴权失败。
 * - `rest-api`：`https://api.cloudflare.com/client/v4/accounts/<acct>/ai/v1`
 *   → 只用 `Authorization: Bearer <Cloudflare 令牌>`。
 * - `direct`：不经过网关、直连厂商 → `Authorization: Bearer <厂商 key>`。
 *
 * 安全约定：**任何返回值都不含密钥本身**，只含「是否发送」的布尔标记（供诊断）。
 */

export type UpstreamAuthMode = 'provider-native' | 'rest-api' | 'direct'

export interface UpstreamTarget {
  /** 完整的上游对话端点 URL */
  url: string
  /** 直接可用的鉴权头（调用方负责再补 content-type / accept） */
  headers: Record<string, string>
  authMode: UpstreamAuthMode
  /** 是否会把厂商 key 发给上游（BYOK 场景应为 false） */
  sendsProviderKey: boolean
  /** 是否会把 Cloudflare 侧令牌发给上游 */
  sendsGatewayToken: boolean
}

export type UpstreamResolution =
  | { ok: true; target: UpstreamTarget }
  | { ok: false; reason: string }

const DEFAULT_AUTH_MODE: UpstreamAuthMode = 'provider-native'

/** OpenAI 兼容的对话端点路径。三种形态的 base 都能拼它（网关 / REST API / 厂商原生）。 */
const CHAT_COMPLETIONS_PATH = '/chat/completions'

function resolveAuthMode(value: string | undefined): UpstreamAuthMode {
  if (value === 'rest-api' || value === 'direct') return value
  return DEFAULT_AUTH_MODE
}

/**
 * 解析上游对话端点 —— **两种填法都收**（这是最容易配错、且错了只报 404 的地方）：
 *
 * - 填 **base**：`https://api.cloudflare.com/client/v4/accounts/<acct>/ai/v1`
 *   → 拼成 `…/ai/v1/chat/completions`
 * - 填**完整端点**：`https://api.cloudflare.com/client/v4/accounts/<acct>/ai/v1/chat/completions`
 *   → 原样使用（**不再重复拼接**）
 *
 * 从控制台复制 URL 时十有八九带的是完整端点，所以这里必须容错：否则会打到
 * `…/chat/completions/chat/completions` 上，而报错只是一个难懂的 404。
 */
export function resolveChatEndpoint(base: string): string {
  const normalized = base.replace(/\/+$/, '')
  if (normalized.endsWith(CHAT_COMPLETIONS_PATH)) return normalized
  return `${normalized}${CHAT_COMPLETIONS_PATH}`
}

/**
 * 给 `/health` 用的地址回显掩码。
 *
 * 为什么要回显「拼出来的上游地址」：上游端点的填法有好几种（`/ai/v1` 还是完整端点、
 * 有没有多余的 `/run`），配错的表现只是一个难懂的 404/400。把结果直接摆出来，
 * 一眼就能看出路径拼对没有。
 *
 * 为什么要掩码 account_id：它出现在 URL 里、本身不是密钥，但没必要在公网可读的
 * `/health` 上完整吐出来 —— 32 位十六进制的账号段统一替换成 `<account_id>`。
 */
export function maskAccountId(url: string): string {
  return url.replace(/[0-9a-f]{32}/gi, '<account_id>')
}

export function resolveUpstream(env: AiEnv): UpstreamResolution {
  const base = env.AI_GATEWAY_BASE_URL?.trim() ?? ''
  if (!base) {
    return {
      ok: false,
      reason:
        '上游未配置：请在 wrangler.toml 设置 AI_GATEWAY_BASE_URL（AI Gateway 的 provider 端点，或 /ai/v1 REST 端点）',
    }
  }

  const authMode = resolveAuthMode(env.AI_GATEWAY_AUTH_MODE)
  const gatewayToken = env.AI_GATEWAY_TOKEN?.trim() ?? ''
  const providerKey = env.AI_PROVIDER_API_KEY?.trim() ?? ''
  const gatewayId = env.AI_GATEWAY_ID?.trim() ?? ''

  const headers: Record<string, string> = {}
  let sendsProviderKey = false
  let sendsGatewayToken = false

  if (authMode === 'rest-api') {
    if (!gatewayToken) {
      return { ok: false, reason: 'AI_GATEWAY_AUTH_MODE=rest-api 需要配置 AI_GATEWAY_TOKEN' }
    }
    headers.Authorization = `Bearer ${gatewayToken}`
    sendsGatewayToken = true
  } else if (authMode === 'direct') {
    if (!providerKey) {
      return { ok: false, reason: 'AI_GATEWAY_AUTH_MODE=direct 需要配置 AI_PROVIDER_API_KEY' }
    }
    headers.Authorization = `Bearer ${providerKey}`
    sendsProviderKey = true
  } else {
    // provider-native：网关令牌可选（未开 Authenticated Gateway 时不需要），厂商 key 可选（BYOK 时不该有）
    if (gatewayToken) {
      headers['cf-aig-authorization'] = `Bearer ${gatewayToken}`
      sendsGatewayToken = true
    }
    if (providerKey) {
      headers.Authorization = `Bearer ${providerKey}`
      sendsProviderKey = true
    }
  }

  /*
    指定 gateway：REST API 与 Provider Native 两种形态都认这个头。
    **直连厂商（direct）不加** —— 那是 Cloudflare 专有头，发给厂商没有意义。
  */
  if (gatewayId && authMode !== 'direct') {
    headers['cf-aig-gateway-id'] = gatewayId
  }

  return {
    ok: true,
    target: {
      url: resolveChatEndpoint(base),
      headers,
      authMode,
      sendsProviderKey,
      sendsGatewayToken,
    },
  }
}

/**
 * 「服务端固定单一模型」的落点。
 *
 * provider 与模型路由由 AI Gateway 配置；这里只回答「请求体里的 `model` 要不要被服务端改写」：
 * 配了 `AI_MODEL_ID` 就**覆盖**客户端传来的 model（前端不必知道模型名），留空则透传。
 *
 * **注意**：这里只报 `hasApiKey` 的布尔值，绝不回显密钥内容。
 */
export interface FixedModelConfig {
  providerKind: 'openai' | 'anthropic'
  modelId: string | null
  gatewayBaseUrl: string | null
  authMode: UpstreamAuthMode
  hasProviderKey: boolean
  hasGatewayToken: boolean
}

const DEFAULT_PROVIDER_KIND = 'openai'

export function resolveFixedModel(env: AiEnv): FixedModelConfig {
  const gateway = env.AI_GATEWAY_BASE_URL?.trim() ?? ''
  return {
    providerKind: env.AI_PROVIDER_KIND === 'anthropic' ? 'anthropic' : DEFAULT_PROVIDER_KIND,
    modelId: env.AI_MODEL_ID?.trim() || null,
    gatewayBaseUrl: gateway || null,
    authMode: resolveAuthMode(env.AI_GATEWAY_AUTH_MODE),
    hasProviderKey: Boolean(env.AI_PROVIDER_API_KEY?.trim()),
    hasGatewayToken: Boolean(env.AI_GATEWAY_TOKEN?.trim()),
  }
}
