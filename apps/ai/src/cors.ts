/**
 * CORS 白名单。
 *
 * 为什么不用 `*`：这个 Worker 会带着**服务端密钥**去调厂商 —— 开放通配来源等于把
 * 模型额度交给任何网页。所以默认只放行本地开发来源，生产必须在 `wrangler.toml` 的
 * `ALLOWED_ORIGINS` 里显式列出真实域名。
 *
 * ⚠️ **CORS 不是鉴权**：它只约束「浏览器里的页面能不能读响应」，拦不住 curl。
 * 上线前必须补真正的鉴权（见 `.agents/docs/ai-server-layer.md` 的「鉴权」一节）。
 */

/** 未配置 `ALLOWED_ORIGINS` 时放行的本地开发来源（web 的 dev server）。 */
const LOCAL_DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 解析允许的来源：命中返回该来源（写进 `Access-Control-Allow-Origin`），
 * 未命中返回 `undefined`（不写 CORS 头 → 浏览器侧拒绝读取）。
 *
 * 无 `Origin` 头的请求（curl、服务端调用）不经过这里 —— CORS 只对浏览器生效。
 */
export function resolveAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: string | undefined,
): string | undefined {
  if (!origin) return undefined
  const configured = parseList(allowedOrigins)
  const allowList = configured.length > 0 ? configured : LOCAL_DEV_ORIGINS
  return allowList.includes(origin) ? origin : undefined
}
