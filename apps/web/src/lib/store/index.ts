/**
 * store 层统一出口。
 *
 * 分三类：
 * - `app-scope` / `scoped-storage`：按应用隔离存储的基础设施；
 * - `preferences-store`：全局本机偏好（语言 / 外观 / 时区）；
 * - `table-ui-store` / `use-app-table-state`：per-app 的表格 UI 状态；
 * - `dashboard-store`：per-app 的仪表盘卡片布局（数据模型见 `#/lib/dashboard-layout`）。
 * - 认证与应用状态在 `#/lib/auth`（同样基于 zustand + persist）。
 *
 * AI 厂商 / 模型配置已从这里移除（模型与凭证都在 `apps/ai`，前端不持有）——
 * 见 `.agents/docs/ai-server-layer.md` §5.3。
 */
export * from './app-scope'
export * from './dashboard-store'
export * from './permission-store'
export * from './preferences-store'
export * from './scoped-storage'
export * from './shell-ui-store'
export * from './table-ui-store'
export * from './use-app-table-state'
