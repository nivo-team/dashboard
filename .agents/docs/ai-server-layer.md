# AI 中间层（Hono on Cloudflare Workers）

> **这份文档是「AI 规则与凭证搬到服务端」这件事的唯一说明**：做到了哪一步、边界在哪、
> 接口长什么样、前端怎么切过来、Cloudflare AI Gateway 怎么用、鉴权与脱敏落在哪。
>
> 相关文档：[`ai-architecture.md`](./ai-architecture.md)（前端 AI 现状与踩过的坑）、
> [`ai-module-inventory.md`](./ai-module-inventory.md)（AI 文件与工具全清单）。

---

## 0. 一句话现状

| | 状态 |
|---|---|
| **已落地** | ① `packages/ai-prompt` 提示词唯一真值；② `apps/ai` 的提示词服务与 **OpenAI 兼容透传管道**；③ **前端已切换**（不再持有提示词，也不再需要配置模型与凭证）；④ 缓存对齐（两段式装配 + 阶梯式衰减 + 指标可见）；⑤ **两阶段按需加载**（Router → Execution，`promptStage` 取层 + 工具目录 + 虚拟 `select_tools`） |
| **前端** | ✅ **已切换**：`runtime.ts` 出站指向中间层、`prompt-facts.ts` 采集事实上报；前端 `lib/ai/prompt/**` 已删除。迁移记录见 §5 |
| **凭证** | 只在 Worker（`AI_GATEWAY_TOKEN` / `AI_PROVIDER_API_KEY` 走 secret） |
| **provider / 模型** | 归 **AI Gateway**；Worker 只保留「上游地址 + 鉴权形态 + 是否覆盖 model」 |
| **鉴权** | **尚未校验**（`/health` 自述 `auth: 'unverified'`）；目标是与后端统一 token，落点见 §8 |
| **脱敏** | **未启用**（`redact.ts` 恒等占位，`/health` 自述 `redaction: false`）；取舍见 §9 |

**验证结果**：提示词服务 27 项 + 管道 29 项（方式见 §6），其中关键一条是 **SSE 逐块到达**
（71 / 110 / 150ms，3 次读取）—— 证明是原样透传而非缓冲后一次性返回。
**另有真实调用基线**（5 轮递进命中率 ~61%、三次完全相同 94.4%）见 §7.7。

---

## 1. 目标架构与边界

```text
浏览器（Vercel AI SDK）
  │  POST /v1/chat/completions   { messages, tools, promptFacts, promptStage }
  │  （不再自己拼 system；apiKey 只是占位）
  ▼
apps/ai（Hono on Cloudflare Workers）
  ├─ 注入服务端 system（packages/ai-prompt 真值，按 promptStage 取层）
  ├─ 剥离私有字段 promptFacts / promptStage、丢弃客户端 Authorization
  ├─ 注入上游凭证（cf-aig-authorization / Authorization）
  └─ fetch 上游 → **原样返回上游 body**（ReadableStream 直接交出）
  ▼
Cloudflare AI Gateway（provider 路由 / 模型 / 重试回退 / 缓存 / 限流 / DLP）
  ▼
厂商
```

### 1.1 三方职责（别互相越界）

| | 前端 | **本 Worker** | **AI Gateway** |
|---|---|---|---|
| 提示词规则 | ❌ 切换后不持有 | ✅ **唯一真值**（代码里） | ❌ |
| 上游凭证 | ❌ 不持有 | ✅ secret | 可用 BYOK 存（见 §10.6） |
| provider / 模型路由 | ❌ 不配置 | 只决定「上游地址 + 是否覆盖 model」 | ✅ **配置在这里** |
| 事实快照 | ✅ 采集并上报 | 消费后剥离 | ❌（它只是透明代理） |
| 工具定义与执行 | ✅ 仍在前端 | 不参与（随请求透传） | ❌ |
| 工具按需加载 | ✅ Router 阶段只发 `select_tools`，`activeTools` 逐步收窄 | 按 `promptStage` 选层 | ❌ |
| 鉴权 | 带登录 token | 校验落点（待接后端） | 可选（Authenticated Gateway） |

### 1.2 规则在服务端，事实由客户端上报

这是「前端拆不出提示词」能成立的原因：**规则**（身份 / 范围闸 / 安全边界 / 能力 / 工作方式 / 回答方式）
写在 `packages/ai-prompt` 的代码里，改规则 = 重新部署；**事实**（应用名、`appId`、导航清单、
页面摘要、工具目录、任务清单、模式、容器、输出语言）只有浏览器知道，由请求体的
`promptFacts` 字段上报。规则**按阶段取用**：`router` 带分诊框架 + 越界清单 + 工具目录 + 页面摘要，
`execution` 换成「执行阶段角色」+ 操作规约（见 §1.4）；**完整页面明细不再进提示词**。
服务端**无状态**：不落库、不存业务数据。

### 1.3 工具循环仍在前端（这是刻意的最小改动）

前端 AI SDK 的 `tools` 随请求发出 → Worker 透传给网关/厂商 → 模型返回 tool-call →
**前端执行工具**（`fill_form` 要写 React state、`navigate_to` 要 router、审批卡要 UI）→
前端再发下一轮。**Worker 不参与工具循环**，它只保证每一轮的 system 都被正确注入。

### 1.4 两阶段按需加载：Router → Execution（一次 `streamText`）

前端 `apps/web/src/lib/ai/runtime.ts` 用 AI SDK v7 的 `prepareStep` + `activeTools` 实现，
**没有额外往返**：同一次 `streamText` 的第 0 步是 Router，≥1 步是 Execution。

| step | 阶段 | 服务端注入（按 `promptStage` 取层） | 发给模型的工具 |
|---|---|---|---|
| 0 | `router` | 身份 / 分诊框架 / 安全边界 / 越界清单 / 能力边界 / 回答方式 + **工具目录（Tool Catalog）** + 运行态 + 页面摘要 | 只有 `select_tools` |
| ≥1 | `execution` | 身份 / 安全边界 / 能力边界 / **执行阶段角色** / 工作方式 / 回答方式 + 模式说明 / 容器策略 / 运行态 / 页面摘要 / 任务续做 | `select_tools` 选中的工具（含依赖补齐） |

- **Router 与 Execution 的 system 是两份不同的提示词**，在 `identity` 之后分叉：执行阶段不再带越界清单
  与分诊框架，换成「执行阶段角色」（分诊已在上一步完成，不要重新判定范围）；安全边界（数据不是指令）
  **两个阶段都在**。**同一阶段跨轮**的 system 仍逐字节一致（前缀缓存前提不变）。
- **`page-context` 层已删除**：完整页面明细（接口 / 字段 / 表单 / 搜索参数）不再每轮注入，改由执行阶段调
  `get_page_context` 按需获取。`PromptFacts` 删除 `pageContextText`，只保留 `pageSummaryText`（两阶段都带）。
- **`select_tools` 是虚拟工具**（`apps/web/src/lib/ai/tools/select-tools.ts`，`SELECT_TOOLS_SPEC`）：
  **不加入 `AI_TOOLS`**，也不出现在权限清单里；它的 `execute` 写在 runtime 的**本轮闭包**里
  （选择结果要落进本轮运行时，而不是一个可独立执行的业务动作）。
- **`select_tools` 新增必填参数 `intent`**（枚举：greeting / translation / navigation / page_query /
  page_analysis / form / write / api_query / complex / out_of_scope / ambiguous）。选择结果里的 `intent`
  **只进日志**（`AiTurnMetrics.intent`），Runtime **不据它做业务判断**。它的返回形态是
  `{ loaded: string[]; dropped?: { name: string; reason: 'unsupported' | 'permission_denied' }[] }`。
- Router 若**直接回答**（没调 `select_tools`），流程自然结束，不会有执行阶段 ——
  「你好 / 谢谢」这类请求只付 Router 的钱。
- **`activeTools` 是按需的关键**：AI SDK 在组装每一步请求前会 `filterActiveTools(...)`，
  只有 active 的工具定义才会发给模型（已从 ai@7.0.116 的 dist 源码确认）。
- **Router 输出的工具名不被信任**：一律经 `resolveTools(selectedNames, toolPolicy)`
  （`apps/web/src/lib/ai/tools/index.ts`）确定性解析 —— ①名字真实存在；②在当前权限 / 容器 /
  表单 / 后端权限点下可用（复用 `getAllowedTools`，不另写一套）；③`dependencies` 自动补齐；
  ④`execution: false` 的过滤掉。返回 `{ tools, selected, addedByDependency, rejected }`，
  `rejected` 只用于日志；runtime 把它映射成 `dropped`（`unknown` → `unsupported`，
  `not-allowed` / `not-executable` → `permission_denied`）后回给 `select_tools`。
  目录文本由 `buildToolCatalogText(allowedTools)` 生成（**当前权限下**可用工具，一行一个）。
- **工具循环、审批、流式事件全不变**；`stopWhen` 从 30 提到 `isStepCount(31)`
  —— 多出的第 0 步是 Router，**执行阶段的工具循环仍是 30 步**。
- `promptStage` 由 runtime 写在每步的请求体里，Worker 消费后删除（§3.2）；
  **缺省 `execution`**。runtime 另有可选的 `onMetrics` 回调，`chat.ts` 里打一行
  `console.info('[ai:turn]', metrics)`，字段见 §3.6。
- **本次没做**：按 `intent` 做**画像化加载**（greeting / navigation / page_query / page_analysis /
  form / write / api / complex 的细分画像）—— 当前只有 router / execution 两档；`intent` 已进日志，
  供下一步据真实数据决定。参数级 `inputSchema` 的 `description` / `example` 也**还没精简**。

---

## 2. 代码地图

| 路径 | 职责 |
|---|---|
| `packages/ai-prompt/src/**` | 提示词唯一真值：`buildSystemPrompt(facts, stage?)` + `buildTurnContext(facts, stage?)` + `layersForStage(stage)` + `PROMPT_LAYERS`（**零运行时依赖**；`stage` 缺省 `execution`） |
| `apps/ai/src/index.ts` | Hono app：CORS、`/health`、路由挂载、404 / onError |
| `apps/ai/src/routes/chat.ts` | **透传管道**：`POST /v1/chat/completions`（注入 → 剥离 `promptFacts` / `promptStage` → fetch → 原样返回） |
| `apps/ai/src/routes/system-prompt.ts` | `POST /v1/system-prompt`（JSON）与 `/stream`（SSE，均接受 `promptStage`）、`GET /layers`（每层 `id` / `title` / `group` / `stages` / `volatile`） |
| `apps/ai/src/facts.ts` | **不信任输入**的规范化（HTTP facts → 安全默认值）+ `resolvePromptStage`（缺省 `execution`） |
| `apps/ai/src/model-config.ts` | 上游地址 + 鉴权形态三选一 + 「是否覆盖 model」 |
| `apps/ai/src/cors.ts` | 来源白名单（**不是鉴权**） |
| `apps/ai/src/redact.ts` | 出站脱敏预留钩子（恒等占位） |
| `apps/ai/src/env.ts` · `wrangler.toml` · `.dev.vars.example` | 绑定类型与部署配置（vars vs secrets 的边界） |
| ~~`scripts/ai/check-prompt-drift.mjs`~~ | **已删除**：前端 `prompt/**` 与漂移门控随切换一并移除（见 §5） |

---

## 3. 接口契约

### 3.1 `GET /health`

```json
{ "ok": true, "service": "nivo-ai", "phase": "gateway",
  "redaction": false, "auth": "unverified", "upstreamConfigured": true,
  "authMode": "provider-native", "hasGatewayToken": true, "hasProviderKey": false,
  "modelId": "gpt-4o-mini" }
```

刻意自述**未启用项**（脱敏 / 鉴权），并把它们放在最容易被 curl 到的地方 ——
免得有人把「已上线」读成「已防护」。只报「有没有配」，**绝不回显密钥**。

### 3.2 `POST /v1/chat/completions` —— 透传管道（OpenAI 兼容）

**请求体**：标准 OpenAI 对话体 + 一个私有字段：

| 字段 | 说明 |
|---|---|
| `messages` | 必填。**客户端的 `system` 消息会被全部丢弃**（服务端是真值） |
| `tools` / `tool_choice` / `stream` / 其它 | 原样透传（工具循环仍由前端驱动） |
| `model` | 配了 `AI_MODEL_ID` 时会被**覆盖**（前端不必知道模型名） |
| `promptFacts` | **私有字段**，事实快照（见 §3.5）。消费后**必然被删除**，不会发给厂商 |
| `promptStage` | **私有字段**，`'router' \| 'execution'`，决定加载哪几层提示词（见 §1.4）。消费后**必然被删除**；**缺省 `execution`**（老前端行为不变） |

**行为**：按 `promptStage` 取层并注入 system → 剥离 `promptFacts` / `promptStage` → 覆盖 model（若配置）→ 注入凭证 →
`fetch` AI Gateway → **原样返回上游 body**（含上游错误码与正文）。

**响应头**：透传上游的 `content-type`、`cache-control` 与 `cf-aig-*` 诊断头
（缓存命中、DLP 命中、重试次数），并加一个自述头 `x-nivo-ai: system-injected`
（便于确认切换是否生效）。

**错误**：

| 状态 | error | 场景 |
|---|---|---|
| 400 | `invalid_json` / `invalid_body` / `missing_messages` | 请求体不合法 |
| 502 | `upstream_unreachable` | 上游网络失败 |
| 503 | `upstream_not_configured` | 未配 `AI_GATEWAY_BASE_URL`（或鉴权模式缺凭证） |

**⚠️ 客户端传来的 `Authorization` 一律丢弃**：上游凭证只由 Worker 注入。
前端 SDK 仍需要一个非空 `apiKey` 占位才能发请求，但它不会到达厂商。

### 3.3 `POST /v1/system-prompt`（JSON）与 `/stream`（SSE）

用于**不走对话链路**地取提示词（调试、核对层序、将来前端本地缓存校验）。
两个端点都接受 `promptStage`（缺省 `execution`）—— 拿它就能直接对比两个阶段的提示词长度。
字段与响应见 `facts.ts` / `system-prompt.ts`；SSE 事件序列为 `meta` → `chunk`* → `done`，
`data` 统一 JSON 化（换行转义，客户端不用自己分帧）。

### 3.4 `GET /v1/system-prompt/layers`

层目录，每层返回 `{ id, title, group, stages, volatile }`（`stages` 不声明时回落
`['router', 'execution']`），给调试与切换时核对层序。

### 3.5 `promptFacts` 字段表

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `'ask' \| 'auto'` | `'ask'` | 只影响模式说明 |
| `surface` | `'panel' \| 'sphere'` | `'panel'` | 只影响工作方式策略 |
| `appName` | string | `''`（装配回落「管理后台」） | 身份层自称 |
| `appId` | string \| null | `null` | **null = 不在任何应用里**（范围闸走外壳分支） |
| `outputLanguageName` | string | `'简体中文'` | **语言自名**（「日本語」），由调用方解析 |
| `pageSummaryText` | string | `''` | 已格式化的页面**摘要**（应用 / 页面 / 路径 / 路由模板），**两个阶段都带**；完整明细（接口 / 字段 / 表单 / 搜索参数）由执行阶段的 `get_page_context` 按需获取，不再进提示词 |
| `toolCatalogText` | string | `''` | 工具目录文本（前端按当前权限生成，一行一个），Router 阶段拼进 system |
| `navEntries` | `{name,path,group}[]` | `[]` | 导航扁平清单（范围闸派生模块行，上限 30 行） |
| `shellNavNames` | string[] | `[]` | 外壳页面名 |
| `activeTasks` | `{id,title,status}[] \| null` | `null` | 会话任务清单；全完成则该层整段缺席 |

`promptFacts` 里**没有** `promptStage` —— 阶段是请求体的**平级私有字段**（§3.2），
与 facts 一起消费后删除。

### 3.6 本轮 token / 选择日志（前端侧）

runtime 有可选的 `onMetrics` 回调，`apps/web/src/lib/ai/chat.ts` 打一行
`console.info('[ai:turn]', metrics)`；字段（`AiTurnMetrics`）：

| 字段 | 含义 |
|---|---|
| `routerInputTokens` / `routerOutputTokens` | Router 这一步的 token |
| `executionInputTokens` / `executionOutputTokens` | Execution 的 token |
| `totalInputTokens` / `totalOutputTokens` | 本轮合计 |
| `selectedTools` / `selectedToolCount` / `addedDependencies` | Router 选中 / 数量 / 依赖补齐 |
| `availableToolCount` / `executionToolCount` / `rejectedTools` | 可用 / 实际进执行 / 被丢弃（含原因） |
| `routerAnsweredDirectly` | Router 直接回答（无执行阶段） |
| `intent` | Router 通过 `select_tools` 上报的意图（`select_tools` 的必填参数，只进日志，不参与业务判断）；无则 `null` |

---

## 4. 提示词真值与漂移门控

`packages/ai-prompt` 是**唯一真值**，前端只上报事实（`apps/web/src/lib/ai/prompt-facts.ts`）。

**切换期**曾有一道机器门控：剥掉注释后提取两侧**中文字符串字面量**做集合比较
（`${...}` 归一成同一占位符），证明服务端与前端那份规则**逐字一致**（当时两侧各 115 条指纹）。
它随前端 `lib/ai/prompt/**` 一起删除了 —— **现在前端已经没有提示词代码，不存在漂移的可能**。

> 历史：脚本是 `scripts/ai/check-prompt-drift.mjs`、命令是 `pnpm guardrails:prompt`。
> 在旧分支上看到它们，那是切换前的状态。

---

## 5. 前端切换：**已完成**（迁移记录）

> 本仓库已落地：`runtime.ts` 的出站端点改为中间层（`createOpenAICompatible` + 自定义 `fetch`
> 注入 `promptFacts`），`streamText` **不再传 `system`**；前端 `lib/ai/prompt/**` 与漂移门控脚本
> 已删除；事实改由 `apps/web/src/lib/ai/prompt-facts.ts` 采集上报。
> 设置页的厂商 / 模型 / Key 卡片**已随本次清理删除** —— 见 §5.3。

### 5.1 唯一的技术难点：怎么把 `promptFacts` 带上

AI SDK 的 `streamText` 没有「自定义请求体字段」的入口，但它允许注入自定义 `fetch`。
所以在 `sendAiMessage`（每轮）构造 provider，闭包捕获当轮事实：

```ts
// apps/web/src/lib/ai/runtime.ts（示意）
const facts = collectPromptFacts(mode, surface)          // 页面摘要/导航/任务/语言自名
const provider = createOpenAICompatible({
  name: 'nivo-ai',
  baseURL: `${AI_SERVICE_BASE_URL}/v1`,                  // ← 指向 apps/ai
  apiKey: 'placeholder',                                 // 不再需要真 Key（Worker 注入）
  fetch: async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    body.promptFacts = facts                              // ← 每轮注入事实快照
    return fetch(url, { ...init, body: JSON.stringify(body) })
  },
})
```

两阶段改造后，同一个 `fetch` 闭包还会写入当轮的 `promptStage`（`prepareStep` 把阶段记在闭包里，
`createWorkerModel` 的 fetch 每个请求前读出来，见 §1.4）—— 服务端据此取层；**不引入额外请求**。

### 5.2 实际改动（已完成）

| # | 动作 |
|---|---|
| 1 | `runtime.ts`：provider 换成上面那个；`streamText` **不再传 `system`**（Worker 注入） |
| 2 | 删掉 `apps/web/src/lib/ai/prompt/**`（切完并核对输出一致之后） |
| 3 | 删掉设置页的厂商 / 模型卡片（含导入导出弹窗）与 `ai-store`：`admin.ai` 键不再被写入或读取，输入区不再有「选择模型 / 思考程度」子菜单，图片 / 文件入口不再按模型能力置灰（**已完成**） |
| 4 | 删 `scripts/ai/check-prompt-drift.mjs` 与 `pnpm guardrails:prompt` |
| 5 | 环境变量加 `VITE_AI_SERVICE_BASE_URL`；`ALLOWED_ORIGINS` 加真实域名 |
| 6 | **必审措辞**：`identity.ts` 末句「运行在用户自己的浏览器里」在流量经服务端后不再准确 |

**顺序**：先切 baseURL 并核对输出（可用 `x-nivo-ai` 响应头确认注入生效），再删本地实现 ——
不要先删，中间窗口期 AI 会失去全部规则。

**工具与审批完全不用动**：`tools` 随请求透传，tool-call 回前端执行，`stopWhen` 循环仍在 SDK 侧。

### 5.3 过渡态的清理进度

**已完成**（前端彻底不再持有厂商 / 模型 / API Key / 能力声明 —— 具体模型与凭证由 `apps/ai`
（`AI_MODEL_ID` 覆盖客户端的 model）与 AI Gateway 决定）：

| 项 | 结果 |
|---|---|
| 设置页「模型服务 / 模型」卡片、导入导出 | **已删**：`ai-provider-card` / `ai-model-card` / `ai-provider-export-dialog` / `ai-provider-import-dialog` 一并移除；设置 → AI 只剩「通用设置」与「AI 权限」两张卡片 |
| `admin.ai`（`ai-store` 的 providers / models / Key） | **已删**：`lib/store/ai-store.ts` 移除、`lib/store/index.ts` 不再导出；该 localStorage 键不再被写入或读取（旧存档残留没有任何代码读取） |
| 前端模型能力声明（`supportsTools` / `reasoningLevels` / `supportsVision`） | **已删**：输入区不再选模型 / 思考程度，图片 / 文件入口**始终可用**；工具是否随请求发出**只由权限决定**（`chat.ts` 的 `getAllowedTools`） |

**仍未完成**：

| 项 | 现状 | 目标 |
|---|---|---|
| `apps/web/package.json` 的 `@ai-sdk/anthropic`、`@ai-sdk/openai` | 已不再被 import（provider 细节归 AI Gateway），但**依赖仍在** | 从依赖里移除（**仍待移除**） |
| **方案 B**：环境说明随消息持久化 | Worker 每轮**插入**环境说明、不进历史 → 命中率卡在 **~61%**（实测见 §7.7） | 前端把它存进消息的隐藏字段（UI 不渲染）→ 命中率预期 **~87%** |

**为什么当初不能一次删干净**：模型「能力声明」（是否支持工具调用 / 思考档位 / 图片）曾由前端
提供给输入区与 `streamAssistantTurn`。清理时前端改为**不声明能力、一律按支持处理** —— 因此
**不需要**服务端再下发能力（也**没有**新增 `GET /v1/model-info` 之类的接口），前端从此不持有
任何模型配置。

**方案 B 仍是这里性价比最高的一项**：它**不需要余额就能验证**（离线看"与前一轮的共同前缀"，
§7.7 的 A 组实验就是这么测的），而且是唯一能把那 61% 明显推高的改动。

---

## 6. 本地开发、部署与验证

```bash
pnpm -C apps/ai dev        # http://localhost:3002
pnpm -C apps/ai deploy
pnpm -C apps/ai exec wrangler secret put AI_GATEWAY_TOKEN
pnpm -C apps/ai exec wrangler secret put AI_PROVIDER_API_KEY
```

**⚠️ 受限沙箱**：wrangler 要写用户目录（macOS `~/Library/Preferences/.wrangler`），
只允许写工作区的沙箱里会 `EPERM`（`WRANGLER_HOME` 不生效，它走 `env-paths`）。正常开发机不受影响。

**不依赖 wrangler 的验证方式**（本轮就是这么验的）：

```bash
ESB=$(ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)
"$ESB" apps/ai/src/index.ts --bundle --format=esm --platform=node --outfile=/tmp/worker.mjs
# 起一个本地假上游（SSE），import /tmp/worker.mjs 后调 app.request('/v1/chat/completions', …, env)
```

**已覆盖的断言**：system 置顶且客户端 system 被丢弃、`promptFacts` 被剥离、
`promptStage` 被剥离（缺省 `execution`）、
凭证注入且客户端凭证未被透传、`model` 被服务端覆盖、`stream` 原样透传、
**SSE 逐块到达（未被缓冲）**、缺 `messages` → 400、未配上游 → 503、
`rest-api` 与 `provider-native` 两种鉴权头的差异、`/health` 不回显密钥。

---

## 7. SSE：为什么可以放心做管道

### 7.1 官方事实（Cloudflare Workers）

> **CPU time**：「CPU time measures how long the CPU spends executing your Worker code.
> **Waiting on network requests (such as `fetch()` calls, KV reads, or database queries)
> does not count toward CPU time.**」
> 限额：Free 10 ms / 请求，Paid 5 min（默认 30 s）。
>
> **Duration（wall time）**：「HTTP request — **No limit**… There is no hard limit on duration for
> HTTP-triggered Workers. As long as the client remains connected, the Worker can continue
> processing, making subrequests, and **streaming a response body**.」
>
> 来源：[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)

**结论**：等待上游与把流挂在那里都**不计 CPU**，所以「透传 SSE」在成本上几乎免费；
需要担心的只有**自己写的处理逻辑**（逐块解析、转换）——那才是 CPU 消耗点。

### 7.2 正确写法（已经这么做）

```ts
const upstream = await fetch(url, { …, signal: c.req.raw.signal })
return new Response(upstream.body, { status: upstream.status, headers })   // ← 不读、不解析、不重编码
```

三个反面做法（会破坏增量 + 吃 CPU）：
`await upstream.text()` 再拼、`pipeThrough(new TransformStream(...))` 逐块改、
自己重新分帧成 SSE。

`c.req.raw.signal` 交给 fetch：**浏览器一断开，上游请求随之取消**，不会空跑完整个回答。

### 7.3 与「提示词 SSE」是两条不同的流

| | `/v1/system-prompt/stream` | `/v1/chat/completions` |
|---|---|---|
| 内容 | 一次装配结果**分块下发** | 上游厂商的 token 流 |
| 实现 | 自己生成分块 | **原样透传** |
| 用途 | 首字节更快、可先给 `meta` | 逐 token 渲染 |

### 7.4 一旦要脱敏，这条结论就会变

逐块改写内容 = 放弃「零处理」，把 CPU 消耗点加回到每个 chunk 上。
届时的取舍（改在 Worker 还是交给网关 DLP）见 §9。

### 7.5 缓存对齐：提示词为什么分两段装配

**结论**：`system` 在 messages 的**最前面**，它里面**任何**变化都会让它后面的一切
（**包括整段对话历史**）失去服务商前缀缓存（prompt caching）匹配。历史是 token 大头 ——
把「每轮都变 / 切换就变」的内容留在 system 里，等于**每轮都为整段历史重新付费**。

所以提示词分两段装配（`packages/ai-prompt`），**落点不同**；每段又**按阶段取层**
（`PromptStage = 'router' | 'execution'`，见 §1.4）：

| | 函数 | 落在哪 | 内容 | `execution` 实测 | `router` 实测 |
|---|---|---|---|---|---|
| **稳定** | `buildSystemPrompt(facts, stage?)` | `messages[0].role='system'` | Router：身份 / 分诊框架 / 安全边界 / 越界清单 / 能力边界 / 回答方式 + 工具目录；Execution：身份 / 安全边界 / 能力边界 / **执行阶段角色** / 工作方式 / 回答方式 | 2319 字符 | 3479 字符 |
| **变动** | `buildTurnContext(facts, stage?)` | 对话**末尾**（最后一条 user 之前） | Execution：模式说明 / 容器策略 / 运行态 / 页面摘要 / 任务清单；Router：运行态 / 页面摘要 | 1891 字符 | 115 字符 |

合计：**Execution 4210 字符、Router 3594 字符**（`stage` 缺省 `execution`，向后兼容）。

**已验证**：同一应用 + 同一语言下，**同一阶段跨轮**的稳定 system **逐字节相同**（缓存命中的前提）；
相同 facts 两次装配结果**完全一致**（不要引入时间戳 / 随机数 / Map 遍历顺序）。
**两阶段的新结论**：Router 与 Execution 的 system 是**两份不同的提示词**，在 `identity` 之后分叉
（执行阶段不再带越界清单与分诊框架，换成「执行阶段角色」；安全边界两个阶段都在）——
**同一阶段跨轮**的 system 仍逐字节一致，前缀缓存前提不变。Execution 从上一版 **5566 → 4210**
（约 −24%，省掉越界清单与分诊框架）；Router 从 **3284 → 3594**（多了 `guard` 与运行态），
但 Router 总量仍远小于 Execution。

**工具 schema 是按需的那一半**（同一脚本口径：提示词 + 工具定义，去掉空白后的字符数）：
重构前每轮 ≈ 提示词 5566 + 全量工具定义 7934 ≈ **13500 字符**；
「你好」场景 ≈ Router 3594 + `select_tools` 定义 733 ≈ **4327 字符**，且**不加载任何业务工具 schema**
→ **同口径降幅约 68%**（真实 token 以 `[ai:turn]` 的 usage 日志为准）。
完整定义只在 Execution 阶段按 `activeTools` 下发（Catalog 阶段一个工具只有一个 `catalogDescription`）。

#### 各家的命中机制不一样，但「稳定前置、可变后置」是通用原则

| 厂商 | 启用方式 | 命中单位 | TTL | 备注 |
|---|---|---|---|---|
| **DeepSeek** | **自动**（无需改代码） | **「缓存前缀单元」**：请求结束位置 / **公共前缀检测** / 固定 token 间隔 三种落盘时机，**完整匹配某单元**才命中 | 几小时~几天（不用即清） | `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`；命中价约未命中的 **1/50**（flash 空闲 0.02 vs 1 元/M） |
| **Anthropic** | **必须显式** `cache_control`：顶层一个字段 = 自动模式（断点自动前移）；逐块放 = 精细模式 | 到**断点**为止的前缀 | **默认 5 分钟**（被使用即免费刷新；1 小时需加价） | ⚠️ **TTL 从请求开始计时，响应生成时间也计入** —— 一个流 4 分钟的回答，后续请求只剩约 1 分钟窗口 |
| OpenAI · Gemini | 见 §7.6 | | | |

**关键修正**：DeepSeek 的「**公共前缀检测**」意味着 —— 即使两轮的完整前缀不匹配，
它也会把**共同前缀**作为单元落盘，下一轮起即可命中。所以「Worker 每轮插入环境说明」
造成的错位**不会导致全不命中**，而是命中**滞后约 1~2 轮**（官方例二就是这个机制）。

**给「必须显式断点」的厂商留的口子**：断点要打在**稳定内容的末尾**。
两段式装配天然知道那条边界（`buildSystemPrompt` 输出的结束处）——将来接 Anthropic
时在这里加 `cache_control` 即可，规则层不用动。

**方案 B（把环境说明持久化进消息）的真实收益**：把命中从「滞后 1~2 轮」收敛到
「完整匹配上一轮」（即官方例一那种正常多轮追加），并让历轮环境说明也命中。
**它是确定性与功能改进，不是数量级省钱** —— 具体估算见 §7.6。

### 7.6 跨厂商前缀缓存对比（改这块之前先看这里）

> 事实来自各厂商官方文档（2026-09 核对）。**数字会变，机制不会** —— 真正要记的是三条共性。

**三条共性（各家全部成立）**：

1. **命中单位都是「前缀」，且要求逐字节一致** —— 改写 / 删除 / 重排任何早期消息都会失配
   （OpenAI 与 xAI 文档都给了正反例）。多轮应用的第一原则：**只追加、不改写历史**。
   ⚠️ 我们的 `toModelMessages` 有**历史衰减**，边界**每轮前移** = 每轮改写一处历史 —— 见下方硬要求 2。
2. **「稳定内容前置、可变内容后置」是各家官方明文建议**：OpenAI `Keep the prefix stable`、
   Gemini `putting large and common contents at the beginning of your prompt`、
   Qwen「将静态内容放在 prompt 开头，将可变内容放在末尾」、xAI `Front-load static content`。
   → 我们的两段式装配**无需为任何一家重构**。
3. **自动模式一律「不保证命中」，且都有最小 token 门槛**（低于门槛静默不缓存、不报错）
   → **监控字段比调参数更重要**。

**四类差异（需要分别适配的地方）**：

| 维度 | 差异 |
|---|---|
| **是否需显式标记** | Anthropic **必须**（`cache_control`，≤4 断点，20-block lookback）；Qwen 显式模式必须；OpenAI 仅 GPT-5.6+ 支持显式断点（≤4）；Gemini explicit 是另一套 cache 对象 API；**DeepSeek / Mistral / xAI 纯自动** |
| **TTL** | DeepSeek **几小时~几天**｜OpenAI `30m`（旧代 `in_memory` / `24h`）｜Gemini explicit 默认 **1h**｜Anthropic / Qwen **5 分钟**（Anthropic 的**响应生成时间也计入** TTL）｜Mistral / xAI 未明确 |
| **计费** | DeepSeek 命中 ≈ **1/50**（无写入费）｜Anthropic 写 **1.25×** / 读 **0.1×**（1h 写 2×）｜OpenAI GPT-5.6+ 写 1.25× / 读 0.1×（旧代无写入费）｜Mistral·Qwen 读 **10%**（Qwen 隐式 20%）｜Gemini explicit 按规模×时长 |
| **指标字段** | DeepSeek `prompt_cache_hit_tokens`／OpenAI `input_tokens_details.cached_tokens`／Anthropic `cache_read_input_tokens`／Mistral·xAI `prompt_tokens_details.cached_tokens`／Gemini `total_cached_tokens` → **采集层要按厂商分支** |

**两条对实现的硬要求**：

1. **断点打在「稳定内容的末尾」** —— 自动型无所谓，**显式型（Anthropic / Qwen / OpenAI-5.6+）是必须**。
   两段式天然给出这条边界（`buildSystemPrompt` 输出结束处），将来接这些厂商时在那里加标记即可。
   ⚠️ Anthropic 的 **thinking block 不能直接打断点**（但随历史 assistant turn 会被缓存）。
2. **别把「改写历史」当优化** —— 历史衰减的边界每轮前移，等于**每轮改写一处历史**；
   在命中价只要 1/10 ~ 1/50 的世界里，「省 token」的账要重算。
   ✅ **已实现**：`apps/web/src/lib/ai/history-boundary.ts` 把衰减改成**阶梯式** ——
   边界每 `DROP_STEP_TURNS`（3）轮才前进一次，只在跨档时改写历史。
   实测 15 轮里改写次数从 14 次降到 **4 次**，保留轮数在 3~5 之间浮动（下限之上最多多留 2 轮）。

**指标怎么看**：`AiStreamEvent` 的 `finish` 事件带上 token 用量（取 AI SDK 归一化后的
`inputTokenDetails.{cacheReadTokens, noCacheTokens}` —— 各厂商原始字段名不同，SDK 已统一），
存进 `AiMessage.usage`，并在助手消息下方显示一行「缓存命中 X · 输入 Y · 输出 Z」
（与工具调用卡片同属**设置 → AI 的「显示详细信息」**开关，默认关 —— 排查缓存命中率时打开它）。

**`cache` 长期偏低、或明明在同一页面连续对话却几乎为 0，就是拼接没对齐的信号** ——
优先查：历史是否被改写、拼接里是否混进了时间戳 / 随机顺序、稳定内容是否被挪到了可变区之后。

**最后别混淆两种缓存**：Cloudflare AI Gateway 的响应缓存缓存的是**完整响应**（命中即回放、
**不再调模型**、不产生 token 计费；默认关闭；cache key 含**整个请求体**，对话场景基本不命中）；
provider 的前缀缓存缓存的是 **KV / 中间状态**（仍调模型生成新输出，按 cached 单价打折）。
两者可叠加，但本质不同。

### 7.7 实测基线与两条实现约束

> 用途：以后动提示词 / 历史拼接时，**拿这组数字做回归对照**。模型固定为 `deepseek/deepseek-chat`
> （客户端故意传假 model，Worker 全部覆盖 —— 顺带验证了「服务端固定模型」生效）。

**A. 5 轮递进（同一话题由简到繁）**

| 轮次 | prompt | 命中 | 命中率 | 未命中 | 耗时 |
|---|---|---|---|---|---|
| 1 | 3107 | 640 | 20.6% | 2467 | 2239ms |
| 2 | 3180 | 1920 | 60.4% | 1260 | 1753ms |
| 3 | 3377 | 2048 | 60.6% | 1329 | 1751ms |
| 4 | 3542 | 2176 | 61.4% | 1366 | 1772ms |
| 5 | 3777 | 2304 | 61.0% | **1473** | 2663ms |

**B. 三次完全相同的提示词**

| 第 n 次 | prompt | 命中 | 命中率 | 耗时 |
|---|---|---|---|---|
| 1 | 3117 | 1920 | 61.6% | 1220ms |
| 2 | 3117 | **2944** | **94.4%** | 993ms |
| 3 | 3117 | **2944** | **94.4%** | 956ms |

**怎么读**：

- **稳定 system 的策略有效**：第 2 轮起就稳在 60%（第 1 轮的 20.6% 是此前请求留下的缓存）。
- **卡在 61% 而不是更高，就是「环境说明每轮重算」的账单**：约 **1000 token/轮**，
  且未命中量随轮次增长（1260 → 1473）。
- 完全相同 → **94.4%**，未命中 173 token。**原因未确认**（可能是「缓存前缀单元」的落点，
  或就是它说的"尽力而为"）—— **别当成 100%**。
- 命中高时**延迟也低**（1220ms → 956ms，约快 20%）。
- **方案 B（环境说明随消息持久化）的预期**：把 A 的 61% 推到 ~87%（未命中降到 ~400-500 token/轮）。

**⚠️ 这是 DeepSeek 的数字**：换厂商必须重测 —— TTL、最小门槛、计费、字段名都不同（§7.6）。

**两条踩过的实现约束**：

1. **AI SDK 的 `streamText` 不接受 `messages` 里的 `system` 角色**（system 必须走顶层参数）。
   我们的 Worker 在对话末尾插一条 `system`（本轮环境），靠**直接构造 JSON body** 实现 ——
   不经过 AI SDK，所以链路正确。但**换成不支持「对话中间 system 消息」的网关时**，
   把那条消息的 `role` 改成 `user` 即可 —— 落点只有 `apps/ai/src/routes/chat.ts` 一处。
2. **账户余额会耗尽**：第三方模型走 Cloudflare Unified Billing，余额不足时返回
   `402 Insufficient balance; add money to your gateway or use BYOK (2021)`。
   排查时注意**这不是配置错误**；给网关配 BYOK 的 **`default` 别名** key 可绕过
   （其他别名不能阻止回落到 Unified Billing）。

---

## 8. 鉴权（**尚未校验** —— 上线前必修）

**风险**：Worker 公网可达且**代持模型凭证**，不鉴权等于公开模型额度。
CORS 白名单**不是鉴权**（它只约束浏览器读响应，拦不住 curl）。

**目标（已确认的方向）**：**与后端统一 token 验证**。落点已经预留好：

1. 前端 `api/index.ts` 的拦截器本就会给请求加 `Authorization: Bearer <token>` 与 `X-App-Id` ——
   前端切换时把这两个头带进 `apps/ai`（AI SDK 的 provider `headers` 或自定义 `fetch` 里加）；
2. Worker 侧新增校验函数（**唯一落点**，建议放在 `src/auth.ts`）：调后端校验端点或本地验签，
   失败返回 401；`/health` 的 `auth` 字段从 `'unverified'` 改成实际模式；
3. **不要把登录 token 当作上游凭证**：它是「谁能用这个服务」的凭据，上游凭证仍是 Worker 自己的
   `AI_GATEWAY_TOKEN` / `AI_PROVIDER_API_KEY` —— 两者不要混。

Cloudflare 侧另有两条可选加固：**Authenticated Gateway**（`cf-aig-authorization`，与上面的校验互补）
与 **Cloudflare Access**（拿到 `cf.user_id`，适合按用户分析/限流）。注意 Access 会作用于**所有**请求，
且 AI Gateway 令牌是**账户级、无法按 gateway 收窄**（§10.6）。

---

## 9. 脱敏（下一轮）

现状：`apps/ai/src/redact.ts` 是恒等占位，`/health` 自述 `redaction: false`。

**这里的取舍比看起来大**：现在管道是「零处理透传」（§7.2），一旦要脱敏，
就必须**逐块读改 messages**（至少请求侧），于是：

| 方案 | 优点 | 代价 |
|---|---|---|
| **Worker 内脱敏**（请求侧 messages） | 完全可控、可审计、可按用户/应用分级；只处理请求，**不影响响应流式** | 需要维护规则；请求体是 JSON（本来就要解析注入 system，**几乎不增加成本**） |
| **网关 DLP** | 免费、零代码、对请求与响应都生效 | **只能 Flag / Block，不能替换**；策略是 gateway 级；开 Response 检查会**缓冲整个流**、破坏 SSE 增量 |

**推荐组合**：Worker 内做**请求侧替换**（正则 + 字段名黑名单），
网关 DLP 作为**第二道发现/阻断**（Check 只设 Request，保住流式增量）。
规则必须由业务方给 —— 提示词服务看不到数据库，猜不出哪些字段敏感。

---

## 10. Cloudflare AI Gateway：配置归属与边界

> 事实来自 Cloudflare 官方文档（2026-09 抓取）。**文档未写的标注「文档未明确」**。

### 10.1 provider 与模型配置在这里（本次改造的归属决定）

| 能力 | 落在 AI Gateway |
|---|---|
| provider / 模型路由 | gateway 配置 + 请求体 `model`（或 Dynamic Routing） |
| 重试 / 模型回退 | gateway 级或 per-request（`cf-aig-max-attempts` ≤ 5、`cf-aig-retry-delay` ≤ 60s、`cf-aig-backoff`） |
| 缓存 / 限流 | `cf-aig-cache-ttl` 等；核心功能免费 |
| 成本与用量观测 | analytics / logs |
| 密钥保管 | **BYOK**（Secrets Store），见 §10.6 |

Worker 侧因此只需要三件事：**上游地址**、**鉴权形态**、**是否覆盖 model**（`model-config.ts`）。

### 10.2 三条接入路径与四个端点（别选错）

| 路径 | 端点 | 鉴权头 | 备注 |
|---|---|---|---|
| **Provider Native** | `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}` | `cf-aig-authorization`（+ 上游 key 走 `Authorization`） | 路径里含 gateway id |
| **REST API**（新集成官方推荐） | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | `Authorization: Bearer <CLOUDFLARE_API_TOKEN>` | 路径里**没有** gateway 标识 → 默认走 `default` gateway |
| Unified API `/compat` | `.../v1/{account_id}/{gateway_id}/compat` | — | ⚠️ **官方已标注 Deprecated**（单模型调用）；只有 dynamic routing 仍只能用它 |

REST API 提供**四个**端点（都走同一份 Cloudflare 账单与网关能力）：

| 端点 | 格式 | 第三方模型 | Workers AI（`@cf/`） |
|---|---|---|---|
| `POST /ai/run` | `{model, input}` 信封 | ✅ | ✅ |
| `POST /ai/v1/chat/completions` | **OpenAI Chat Completions** | ✅ | ✅ |
| `POST /ai/v1/responses` | OpenAI Responses | ✅ | 视模型而定（如 GPT-OSS） |
| `POST /ai/v1/messages` | Anthropic Messages | ✅ | ❌ 不支持 |

**三条必踩的配置约束**：

1. **`model` 必须用网关的命名**：第三方是 **`author/model`**（`openai/gpt-4.1`、`anthropic/claude-sonnet-4`、
   `deepseek/deepseek-chat`、`google/gemini-3-flash`、`xai/grok-3`）；Workers AI 是 **`@cf/author/model`**
   （如 `@cf/moonshotai/kimi-k2.6`）。**裸模型名（`gpt-4o-mini`）会失败** → 对应 `AI_MODEL_ID`。

   **实测补充（在真实账户上跑过，2026-09）——「文档说的」与「实际能调的」不是一回事**：

   | model id | 实测 | 结论 |
   |---|---|---|
   | `deepseek/deepseek-chat` | ✅ 200 | **不在官方模型目录里**（目录中第三方 DeepSeek 只有 `deepseek/deepseek-v4-pro`）却可用 → `{provider}/{model}` 的 `model` 段走 **provider 侧命名**，不限于目录精选。**属未文档化路径**，可能随命名调整而变 |
   | `deepseek/deepseek-flash` | 404 `Model not found` (7003) | **不存在**。⚠️ 常见的错误推断是"想要 flash 就补上 `-flash` 后缀" —— 恰恰相反：**Cloudflare 会把 `deepseek/deepseek-chat` 路由到 flash**，响应里 `"model":"deepseek-flash"` 就是这个路由的证据。要 flash 就用 `deepseek/deepseek-chat` |
   | `deepseek/deepseek-v4-pro` | 402 `Insufficient balance` | 目录里的正规 id；第三方走 Unified Billing，**需先充值 credits**，或配 BYOK 的 **`default` 别名** key（其他别名不能阻止回落到 Unified Billing） |
   | `@cf/deepseek-ai/deepseek-v4-flash-0731` | 403 | Workers AI 路径，标注 "Paid access required"，需 Workers Paid / 预付 credits |
   | `@cf/meta/llama-3.1-8b-instruct` | 410 deprecated | 2026-05-30 弃用；免费连通性测试改用 `@cf/ibm-granite/granite-4.0-h-micro`（$0.017/M） |

   **核对模型 id 的办法**：成功的响应里有 `"model"` 字段 —— 它显示**上游实际用了哪个模型**。
   `deepseek/deepseek-chat` 返回 `"model":"deepseek-flash"` 就是路由被改写的直接证据；
   配错时则会得到 `7003 Model not found`。**别靠名字猜路由，看这个字段。**

   **报错要分清**：`7003 Model not found` = 模型 id 错；`402 Insufficient balance` = 账户余额/BYOK 问题
   （**不是配置错**）；`403 not available on ... plan` = 计划档位不够。三者常被混为一谈。
2. **令牌权限**：`/accounts/{account_id}/ai/*` 需要 **Account > Workers AI > Read**。
   「只给 `AI Gateway` 权限」的令牌会返回 **401 + error code 10000**（最常见的卡点）。
   `AI Gateway` 权限只管 `/ai-gateway/*`（配置、日志、路由）。
3. **指定 gateway 要加头**：REST API 路径不含 gateway id，不带 `cf-aig-gateway-id` 就落到账户的
   **default gateway**；Workers AI 的 `@cf/` 模型**官方要求必须带**该头 → 对应 `AI_GATEWAY_ID`。

**URL 的两种填法都收**（`model-config.ts` 的 `resolveChatEndpoint`）：填到 `/ai/v1` 为止，或直接粘贴
控制台给的完整端点（结尾是 `/chat/completions`）——后者不会被重复拼接。**这是复制粘贴必踩的坑**：
重复拼接会打到 `…/chat/completions/chat/completions`，只报一个难懂的 404。

来源：[REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) ·
[get-started](https://developers.cloudflare.com/ai-gateway/get-started/) ·
[Unified API（Deprecated）](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/)

### 10.3 与本仓库 `ai@7` 的接法

- 官方推荐专用包 `ai-gateway-provider`（`createAiGateway` + provider，`ai: ^7.0.11` peer 对得上——版本来自 npm，**官方文档未写**）；
- 不引新包的最小改法：`createOpenAI({ apiKey: CLOUDFLARE_API_TOKEN, baseURL: '…/ai/v1' })`；
- `createOpenAICompatible` 在 Cloudflare 文档里**没有出现**（文档未明确）。我们的管道是**自己实现**的 OpenAI 兼容端点，与它无关。
- 来源：[Vercel AI SDK](https://developers.cloudflare.com/ai-gateway/integrations/vercel-ai-sdk/)

### 10.4 自定义 provider

面向**任意有 HTTPS 端点**的厂商（不限 OpenAI 兼容）。要点：`base_url` 必须 `https://`、`slug` 账户内唯一、
请求时必须加 **`custom-` 前缀**、`enable` **默认 false**、`base_url` 只放根域（路径写在请求里，否则 `/v1/v1/...` 404）。
来源：[Custom Providers](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)

### 10.5 它**不能**做什么（重要）

- **没有请求体改写**。`cf-aig-*` 只覆盖缓存 / 日志开关 / 超时 / 重试 / metadata（≤5 条）/ 限流。
- 所以**提示词注入与脱敏都不能指望它兜底** —— 这正是 `apps/ai` 存在的理由。
- 来源：[Request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/)

### 10.6 BYOK 与鉴权分层

- BYOK 把 provider key 存进 **Secrets Store**（前提：gateway 已开 Authenticated Gateway）。
  **代码里删掉 provider key、请求里不要带 provider 授权头** —— 网关只在授权头**缺失**时才注入；
  继续发会把占位符透传给厂商导致鉴权失败。同时**仍要带** `cf-aig-authorization`。
  → 对应我们的配置：BYOK 场景下 **`AI_PROVIDER_API_KEY` 留空**（`model-config.ts` 已按此实现）。
- ⚠️ **AI Gateway 令牌是账户级的、无法按 gateway 收窄**：持 `AI Gateway Run` 者可打该账户下**所有** gateway
  （包括存了 BYOK key 的）。多租户隔离要靠**分账户**或 **Worker binding**（binding 访问是预认证的）。
- 来源：[BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/) ·
  [Authenticated Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)

### 10.7 DLP 的真相：只能阻断或标记，不能脱敏

- Action 只有 **`Flag`**（记录 + 原样放行）与 **`Block`**（拦截，错误码 2029 / 2030），**没有替换/打码**。
- 只扫 request / response **文本 body**；不解码 base64 图片、不跟随外链；tool call 的 arguments / results 会扫到。
- **策略是 gateway 级**，无 per-request 开关。
- **开 Response 检查会破坏流式增量**（缓冲整个流再扫），首 token 延迟显著上升；只查 Request 则不影响。
- **缓存命中会跳过 DLP**；改了策略，已缓存响应不会被重扫。
- 免费（all plans）；**无 Zero Trust 订阅的账户只有两个预定义 profile**
  （Financial Information、Social / Insurance / National Identifier Numbers），全量集需带 DLP 的 Zero Trust 订阅。
  （概览页与 pricing 页的 profile 清单不一致，**以 pricing 页为准更保守**。）
- 来源：[DLP 概览](https://developers.cloudflare.com/ai-gateway/features/dlp/) ·
  [Set up DLP](https://developers.cloudflare.com/ai-gateway/features/dlp/set-up-dlp/) ·
  [pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)

### 10.8 关键限制与成本

- Gateway 数：免费 10 / 付费 20；可缓存请求体 25 MB；cache TTL 上限 1 个月。
- **Unified Billing 限流：200 请求 / 60 秒 / gateway**（超限 429）；**BYOK 走自有 key 不受此限**。
- 日志：2026-09-24 及以后建首个 gateway 的客户走 **Workers Logs** 计费；此前走 Legacy Logs。
- 成本：**核心功能免费**、**DLP 免费**；Guardrails 按 Workers AI token 计费；Unified Billing 收 5%；
  Logpush 仅付费计划。**BYOK / Custom Providers 是否收费：文档未明确**，成本模型里标待确认。
- 来源：[Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/) ·
  [Pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)

---

## 11. 风险与待办清单

| # | 项 | 处理 |
|---|---|---|
| 1 | **公网无鉴权** | 与后端统一 token：落点 `src/auth.ts` + 前端带 `Authorization`/`X-App-Id`（§8） |
| 2 | **脱敏未启用** | 请求侧在 Worker 内替换 + 网关 DLP 只查 Request（§9），规则待业务方给 |
| 3 | ~~**前端两份提示词**~~ | ✅ 已收敛：前端 `prompt/**` 与 `scripts/ai/check-prompt-drift.mjs` / `pnpm guardrails:prompt` 均已删除，规则只在 `packages/ai-prompt` 一处 |
| 4 | **`identity.ts` 措辞** | 「运行在用户自己的浏览器里」在流量经服务端后需改（§5 第 6 条） |
| 5 | **DLP 不是脱敏** | 只能 Flag/Block；Response 检查会破坏 SSE 增量（§10.7） |
| 6 | **AI Gateway 令牌是账户级** | 无法按 gateway 收窄；多租户靠分账户或 Worker binding（§10.6） |
| 7 | **沙箱内 `wrangler dev` 失败** | 用 esbuild + `app.request()` 验证（§6） |
| 8 | **CORS ≠ 鉴权** | 生产必须在 `ALLOWED_ORIGINS` 显式列域名 |

---

> **改这个中间层时**：规则改动 → 只动 `packages/ai-prompt/src/layers/**`（规则唯一真值就在这里）；
> 接口或管道行为改动 → 同步本文 §3 / §5，并重跑 §6 的两组验证。
