/**
 * Worker 的绑定与环境变量。
 *
 * 两类来源、别混：
 * - **vars**（`wrangler.toml` 的 `[vars]`）：非敏感配置，可进 git，部署时随代码走；
 * - **secrets**（`wrangler secret put` / 本地 `.dev.vars`）：密钥，**绝不进 git、绝不进 vars**。
 *
 * 本轮（只拼提示词）只用到 `ALLOWED_ORIGINS`；其余三项是「服务端固定单一模型」与
 * 将来「模型流量经 AI Gateway 出站」的落点，见 `model-config.ts`。
 */
export interface AiEnv {
  /** 允许的前端来源，逗号分隔。留空时只放行本地开发来源（见 `cors.ts`）。 */
  ALLOWED_ORIGINS?: string
  /** 固定使用的厂商规范：`openai` | `anthropic`（本轮不调用，只声明） */
  AI_PROVIDER_KIND?: string
  /** 固定使用的模型 id（本轮不调用，只声明） */
  AI_MODEL_ID?: string
  /**
   * AI Gateway 的鉴权方式（决定请求头上怎么带凭证）：
   *
   * - `provider-native`（默认）：`https://gateway.ai.cloudflare.com/.../{provider}` 形态
   *   → Cloudflare 侧令牌放 `cf-aig-authorization`，厂商 key 放 `Authorization`；
   *   **若厂商 key 已用 BYOK 存在网关里，这里就不要填 `AI_PROVIDER_API_KEY`**
   *   （网关只在厂商授权头缺失时才注入存储的 key）。
   * - `rest-api`：`https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1` 形态
   *   → 只用 `Authorization: Bearer <Cloudflare 令牌>`，无独立的厂商头。
   * - `direct`：不经过网关，直连厂商 → `Authorization: Bearer <厂商 key>`。
   */
  AI_GATEWAY_AUTH_MODE?: string
  /** Cloudflare 侧令牌（gateway 鉴权）—— **secret** */
  AI_GATEWAY_TOKEN?: string
  /**
   * 要路由到的 AI Gateway id（对应 `cf-aig-gateway-id` 请求头）。
   *
   * 为什么需要它：REST API 的路径里**没有 gateway 标识**
   * （`/accounts/<acct>/ai/v1/chat/completions`），不带头就落到账户的 **default gateway**。
   * 想明确走某个 gateway（或调用 Workers AI 的 `@cf/` 模型，官方要求必须带）就填这里。
   */
  AI_GATEWAY_ID?: string
  /**
   * 上游端点（AI Gateway 或厂商原生 baseURL）。
   *
   * 两种官方形态：
   *
   * - **Provider Native**：`https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/<provider>`
   *   —— 把厂商 SDK 的 baseURL 换掉即可；鉴权头是 `cf-aig-authorization`，上游 key 仍放 `Authorization`。
   * - **REST API**（新集成官方推荐）：`https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1`
   *   —— 用 `Authorization: Bearer <CLOUDFLARE_API_TOKEN>`，子路径 `/chat/completions` · `/responses` · `/messages`。
   *
   * ⚠️ OpenAI 兼容的 Unified API（`/compat`）官方已标注 **Deprecated**（单模型调用）。
   * 取舍与鉴权分层见 `.agents/docs/ai-server-layer.md`。留空表示「尚未接入网关」。
   */
  AI_GATEWAY_BASE_URL?: string
  /** 厂商 API Key —— **secret**，只允许由 `wrangler secret` / `.dev.vars` 提供 */
  AI_PROVIDER_API_KEY?: string
}
