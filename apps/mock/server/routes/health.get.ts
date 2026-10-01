import { defineHandler } from 'nitro'

/**
 * 健康检查。
 *
 * 给部署平台（Cloudflare / Vercel 的存活探针）与本地排查用。
 * 刻意不写 `defineRouteMeta`，因此它不会出现在给前端用的契约里
 * （契约的过滤规则见 `packages/api-client/contract.config.json`）。
 */
export default defineHandler(() => ({
  status: 'ok',
  service: 'admin-mock-api',
  time: new Date().toISOString(),
}))
