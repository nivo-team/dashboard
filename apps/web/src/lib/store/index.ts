/**
 * store 层统一出口。
 *
 * 分三类：
 * - `app-scope` / `scoped-storage`：按应用隔离存储的基础设施；
 * - `preferences-store`：全局本机偏好（语言 / 外观 / 时区）；
 * - `table-ui-store` / `use-app-table-state`：per-app 的表格 UI 状态；
 * - `dashboard-store`：per-app 的仪表盘卡片布局（数据模型见 `#/lib/dashboard-layout`）。
 *
 * 认证与应用状态是一个例外：store 本体在 `./auth-store`，但**刻意不进这个桶** ——
 * 它在模块初始化时会注册 API 凭据拦截器与跨标签页同步（见 `#/lib/auth`），
 * 桶里再转一手会让每个引 `#/lib/store` 的底层模块连带触发这些副作用。
 * 需要时从 `#/lib/auth`（推荐）或 `./auth-store` 直接引。
 *
 * AI 厂商 / 模型配置已从这里移除（模型与凭证都在 `apps/ai`，前端不持有）——
 * 见 `.agents/skills/ai-development/references/ai-server-layer.md` §5.3。
 */
export * from './app-scope'
export * from './dashboard-store'
export * from './permission-store'
export * from './preferences-store'
export * from './scoped-storage'
export * from './shell-ui-store'
export * from './table-ui-store'
export * from './use-app-table-state'
