/**
 * AI 能力出口（运行时 / 工具层 / 上下文）。
 *
 * 分层与设计约定见 `.agents/docs/ai-integration.md`：
 * - `types`：工具与消息的公共类型（与厂商、SDK 无关）；
 * - `page-context`：当前 URL / 路由 / 应用的采集，以及把 router 能力注入进来的「外壳桥」；
 * - `page-reload-bridge`：页面把「重新取数」交给 AI 通道（写操作成功后刷新列表用）；
 * - `tools`：工具注册表（名字 / 描述 / JSON Schema / access）；
 * - `session-store` / `chat`：面板的会话状态与「发一条消息」的驱动逻辑；
 * - `session-boot`：本次页面载入算不算「重新载入」，决定要不要开一段新会话；
 * - `prompt-facts`：**事实采集**（页面上下文 / 导航 / 任务 / 语言）—— 随请求上报给中间层。
 *   系统提示词的**规则不在前端**：真值在服务端 `packages/ai-prompt`（见 ai-server-layer.md）。
 *
 * **`runtime` 刻意不在这里导出**：它 import 了 AI SDK 与 provider 包（几百 KB），
 * 静态导出会让任何 `import '#/lib/ai'` 的文件（包括挂在 AppShell 上的面板与输入框）
 * 把它们拖进主 bundle。`chat.ts` 用动态 `import('./runtime')` 在真正发送时才加载。
 */
export * from './chat'
export * from './form-bridge'
export * from './page-capabilities'
export * from './page-context'
export * from './page-context-registry'
export * from './page-reload-bridge'
export * from './panel-session'
export * from './prompt-facts'
export * from './route-refs'
export * from './search-params-bridge'
export * from './session-boot'
export * from './session-groups'
export * from './session-permissions'
export * from './session-store'
export * from './tools'
export * from './types'
export {
  deleteComposerDraft,
  getComposerDraft,
  saveComposerDraft,
  type AiComposerDraft,
  type AiSessionRecord,
  type AiSessionSummary,
} from './session-db'
