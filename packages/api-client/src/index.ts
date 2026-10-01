/**
 * `@admin/api-client` 的公共导出面 —— 应用侧唯一需要的入口。
 *
 * 这个包同时持有两样东西，它们是同一份契约的两种形态：
 *
 * 1. **契约真值**：`openapi.json`（由 `scripts/sync.mjs` 从 mock / url / file / apifox 同步）；
 * 2. **生成产物**：`src/generated/`（`openapi-ts` 生成的 SDK / 类型 / 运行时 JSON Schema /
 *    TanStack Query options）与 `src/*.gen.ts`（从契约压出来的派生索引）。
 *
 * 应用（如 `apps/web`）只做「应用侧封装」：配置 baseUrl、挂请求/响应拦截器、
 * 接入自己的错误提示与登录态清理；业务代码统一从应用侧的 `#/api` 导入，
 * 那边会 `export *` 转发这里的一切。
 *
 * 注意 **不要** 在这里导出 `endpoint-specs`：它是为 AI 上下文压缩出来的索引，
 * 体积不小且只在需要时才用，调用方通过子路径 `@admin/api-client/endpoint-specs`
 * 动态 import 它，避免被打进主 chunk。
 */

// 自动生成的 SDK 方法 + 全部请求/响应类型 + 客户端类型
export * from './generated'
// 运行时 JSON Schema（@hey-api/schemas 产物）：供表格列自动编排与表单校验复用。
// 只按需 import 具体 schema，未被引用的部分会被 tree-shaking 移除。
export * from './generated/schemas.gen'
// TanStack Query 产物（@tanstack/react-query 插件）：
// 每个接口都会生成 `xxxQueryOptions()` / `xxxQueryKey()` / `xxxMutation()`，
// 页面直接用 useQuery(useMutation) 接入即可获得缓存、去重与失效重取能力
export * from './generated/@tanstack/react-query.gen'
// 预配置客户端实例（baseUrl 由应用侧通过 setConfig 覆盖）
export { client } from './generated/client.gen'
// 从契约 query 参数压出来的筛选字段目录（当前取 GET /user）
export * from './query-params.gen'
// 筛选条件 → query 参数的纯函数转换（框架无关，可被任何 app 复用）
export * from './query-filters'
