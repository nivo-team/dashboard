# AI 接入技术选型调研（fx.sh / Vercel AI SDK / Beautiful UI / 浏览器内工具层）

**采集时间**：2026-09-27（本机 CST）。
**采集方式**：`web_fetch` 直取官网、GitHub API、npm registry 原始 JSON、raw 源码；`curl` 直连厂商 API 实测 CORS；部分 npm 包 dist 全文 grep。**凡本机无法验证的一律标 `未确认`，不编造版本号与 API 名。**

**本机环境限制（影响下文取证）**：本机 `api.openai.com` **完全不可达**（`curl` exit 28 / http_code 000）；`api.anthropic.com` 可达但边缘直接返回 403（出口 IP 为 HKG/SIN，疑地区或风控拦截）；`platform.openai.com`、`openai.com` 返回 403；`claude.com` 跳转 `app-unavailable-in-region`；`web_search` 工具端点返回 401 不可用。因此**厂商侧 CORS 只能标注未确认**，已改用「官方 SDK 源码 + 官方 README」作为替代一手证据。

**评估前提（项目硬约束）**：React + Vite 8 + TS 6 纯客户端渲染 SPA；**无 SSR、无自有 Node 后端**；TanStack Router + TanStack Query 5 + zustand 5 + Tailwind v4（无 config）+ `@cloudflare/kumo` 2.14；RTL（阿拉伯语）与 7 语言必须支持；**不能依赖很新的浏览器特性**（WebMCP 已排除）；API Key 由使用者自填。

**本仓依赖树实测**（读 `package.json` + `pnpm-lock.yaml` + `node_modules/.pnpm`，非记忆）：
- `react` / `react-dom` 声明 `^19.2.0`，**lockfile 实际解析为 `19.3.0`**（`@types/react@19.3.0`）→ 这**满足** `@ai-sdk/react` 声明的 peer `^19.2.1`，之前担心的 peer 冲突**不成立**。
- **`zod@4.6.5` 已经在依赖树里**（作为 `@cloudflare/kumo@2.14.0` 的 peer，pnpm store 目录 `node_modules/.pnpm/zod@4.6.5`），但**没有 hoist 到根 `node_modules/zod`**（pnpm 默认严格布局）。因此 AI SDK 声明的 peer `zod: ^3.25.76 || ^4.1.8` **在版本上已被满足**，没有引入新的大版本族；但若我们自己的代码要 `import { z } from 'zod'`，仍需把 zod 提升为直接依赖（或依赖 pnpm 的 `auto-install-peers` 自动补装）。

---

## 一、结论先说（TL;DR）

1. **fx.sh 不能作为依赖引入本项目。** 它是 Vercel Labs 的 **Zig 编写的编码 agent / CLI**（Apache-2.0，v0.0.11，标注 `experimental · use at your own risk`），可嵌入部分叫 `libfx`。浏览器路径（`libfx/browser`）**硬依赖 WebAssembly JSPI**（Chrome/Edge **137+**、Safari 27+，WebKit STP 238），且 npm 包 unpacked **36.4 MB**、包内无 `browser` 字段（`exports` 里给了 browser 入口），**与我们「不依赖很新浏览器特性」的约束直接冲突** → 放弃引入。**但它的权限模型设计非常值得抄**：三态模式（`ask` / `auto` / `full-access`）+ 通配符规则表 + 会话级 grant + 无解时 fail-closed（见 §1.4）。
2. **Vercel AI SDK 是本项目最合适的唯一新增依赖**，当前稳定大版本是 **v7**（npm `ai@7.0.116`，Apache-2.0）。它**同时**给了我们需要的三件事：① `streamText` + `tool()` + `stopWhen` 的多步工具循环；② **官方的 human-in-the-loop 审批**（`toolApproval: 'user-approval'` + `addToolApprovalResponse` + `sendAutomaticallyWhen`）；③ **纯浏览器就地运行**的通道（`DirectChatTransport`，把 Agent 直接接进 `useChat`，不走 HTTP）。**注意：AI SDK 的 provider 层没有 `dangerouslyAllowBrowser` 这种东西**（对 `@ai-sdk/openai@4.0.78` dist 425 KB 与 `llms-full.txt` 6.1 MB 全文 grep，命中 0），需要在浏览器跑的是它**底层不依赖官方厂商 SDK**、自己发 fetch，所以不存在浏览器拦截。
3. **`inputSchema` 可以不引 zod**：`tool({ inputSchema: jsonSchema<...>({...}) })` 接受 **JSON Schema**。这正好对接本项目已有的 `packages/api-client/src/generated/schemas.gen.ts`（Hey API 生成的运行时 JSON Schema，经 `#/api` 转发）。另：`zod@4.6.5` **本来就在本仓依赖树里**（`@cloudflare/kumo` 的 peer），版本上已满足 `ai@7` 的 peer 要求 `^3.25.76 || ^4.1.8` —— 也就是说 **AI SDK 不会给我们带来新的大版本族**。
   附注：`ai@7` 系列包都声明 `engines: node >= 22`；本仓没有 `.npmrc`（未设 `engine-strict=true`），pnpm 默认只**告警不阻断**，但本机开发用 Node 版本建议先升到 22+。
4. **Beautiful UI 是 MIT 的 copy-paste 组件集合，不是 npm 包，也不提供 shadcn registry 安装命令** → 只能「照着自己实现」。好消息是它的 `ThinkingState.tsx` 源码完全暴露，**我可以给出精确到毫秒与缓动曲线的复刻规格**（见 §3.4）。它有 3 处会拖累我们：自研颜色令牌（`text-ink-2` / `bg-hover` / `border-line`…）、无 `prefers-reduced-motion` 处理（与本仓 `motion-safe:` 约定冲突）、以及需要我们自己补动画 keyframes。
5. **WebMCP 现在确实不能用**：规范是 **「WebMCP Draft Community Group Report, 26 September 2026」**，官方 status 原文明确 *"It is not a W3C Standard nor is it on the W3C Standards Track"*；落地形态是 **Chrome 149 Origin Trial**（需登记）与 **Edge 150 Origin Trial**，本地开发要开 `about:flags#enable-webmcp-testing`。**stable 不可用** → 与我们的判断一致。
6. **不要引 `@modelcontextprotocol/sdk`**（v1 = 1.30.1 已经是 legacy，v2 拆成 `@modelcontextprotocol/{client,server,core}@2.1.0`）。但「只要数据模型」这条路**已经被 AI SDK 走通了**：`@ai-sdk/mcp@2.0.60` 的 `createMCPClient({ transport: { type: 'http' } })` 就是浏览器可用的 HTTP-only 路径，并且**官方文档直接给了「用 MCP `annotations`（`readOnlyHint` / `destructiveHint`）驱动 `toolApproval`」的完整示例**（见 §4.3）。**我们要的东西它全有，不需要自己造，也不需要 MCP 传输层。**
7. **推荐的最小落地栈**：`ai` + `@ai-sdk/react` + `@ai-sdk/openai`（或 `@ai-sdk/openai-compatible` 走自建/第三方网关）+（可选）`@ai-sdk/mcp`。工具表、权限标注、审批 UI、thinking 动效全部自己写，本仓库现有的 `#/components/ai-panel`、`AiComposer`、`use-panel-resize`、Kumo 令牌体系都可原地复用。

---

## 二、问题 1：https://fx.sh/ 到底是什么 —— **结论：不能直接引入**

### 1.1 结论先行

| 问题 | 结论 |
|---|---|
| 形态 | **CLI + 可嵌入 agent 运行时（SDK）**，不是 SaaS、不是浏览器扩展、不是 iframe 服务。定位原文：*"Tiny, open, native coding agent"* / *"a coding agent harness and CLI written in Zig, optimized for research and embeddability as part of larger systems"* |
| 仓库 / 许可 / star | `vercel-labs/fx`（Apache-2.0）；**3,158 ★ / 357 fork**；创建 2026-08-11，**最近 push 2026-09-26**；245 open issues；官网标注 `status: experimental (i) — use at your own risk, we will be making frequent changes` |
| 版本 | CLI 与 SDK 均为 **v0.0.11**；npm 包 **`libfx@0.0.11`**（Apache-2.0，**0 个运行时依赖**，unpacked **36,444,499 B ≈ 36.4 MB**） |
| 支持的运行时 | **Node**（native addon，Node 侧 `getBackendInfo()` 只在 Node 有）+ **浏览器 WASM**（`libfx/browser`）。WASM 路径**必须有 JSPI** |
| 能否在纯前端 SPA 里当依赖用 | **不能（硬约束冲突）**。理由见 1.2 |
| 嵌入方式 | npm 包 `libfx`（`createFxAgent()` 无头 Agent / `createFxTerminal()` 带 xterm.js 的交互终端）。**不是 iframe，也不是 extension**。官方示例是 plain HTML + `libfx/browser` |

### 1.2 为什么不能引入（逐条硬理由）

1. **JSPI 是硬门槛，且正是被排除的那类特性。** 官方原文：*"The SDK requires JavaScript Promise Integration (JSPI). Chrome and Edge include JSPI starting in version 137. WebKit added it in Safari 27 and Safari Technology Preview 238. … Call `supportsJspi()` before loading WebAssembly"*。
   → 我们需要兼容「不能依赖很新浏览器特性」；Chrome 137 / Safari 27 量级的门槛与我们排除 WebMCP 的理由同类。
2. **产物体积不可接受。** `libfx` unpacked ≈ **36.4 MB**（内含 `fx-core.wasm` / `fx-term.wasm`），是纯 SPA 首屏/按需 chunk 的负担；`fx-core.wasm` 单文件 6.44 MiB（官网首页自述）。
3. **它假设自己有 key，且官方明确反对在客户端放长期 key。** 官方原文：*"Do not embed a long-lived API key in client code. For production, proxy AI Gateway requests through your backend."* 而 `AgentOptions.apiKey` 是**必填**且语义是「AI Gateway credential」。我们的场景是 BYOK 单用户工具，虽然 key 本来就由使用者自己填，但这条官方警告说明**这个 SDK 的目标形态是服务端**。
4. **实验状态。** `status: experimental`；SDK 在 0.0.7 → 0.0.11 之间发生过 **破坏性 API 重写**（`agent.createSession()`/`session.prompt()` → `createFxAgent()`/`agent.prompt()`，官方专门写了一节 *"Migrating from 0.0.7"*）。跟一个 0.x 且自述「频繁变更」的包，维护成本高于收益。
5. **它的工具集是「编码 agent」的工具集，不是「后台管理 SPA」的工具集。** 内建工具是 `glob_files` / `grep_files` / `read_file` / `write_file` / `edit_file` / `shell` / `web_search` / `web_fetch` / `vision` / `skill` / `subagent`。官方明确：*"fx does not currently include interactive browser or CDP tools."* 且 `createFxAgent` 里 *"No CLI tools are enabled automatically."* —— 也就是说我们想让它「读当前路由 / 导航 / 调业务接口 / 填表单」，**工具还是得我们自己写**，它只提供循环与权限外壳。既然如此，用 AI SDK 更轻。

### 1.3 它的工具定义方式（可直接借鉴的数据模型）

`libfx` 的 host tool 是**纯 JSON Schema、不依赖 zod**，且限制写得很清楚：

```ts
// 摘自 https://fx.sh/docs/lib/api.md （libfx@0.0.11）
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface HostTool {
  name: string                                  // 1–64 字符，仅 [A-Za-z0-9_-]，全局唯一
  description: string
  inputSchema: Record<string, JsonValue>        // 必须是可 JSON 序列化的 object schema
  execute(
    input: unknown,
    context: { signal: AbortSignal },
  ): MaybePromise<JsonValue | undefined | RichToolResult>
}

interface RichToolResult {
  type: 'libfx.tool-result'
  text: string
  images: Array<{ type: 'image'; mimeType: string; data: string }>  // base64；≤8 张，每张 ≤5 MiB
  isError?: boolean
}
```

配套约束（值得抄进我们自己的工具注册表）：
- **工具数量上限 64**（`tools?: HostTool[]`，*"Up to 64 explicit host tools"*）。理由官方没写，但 §4.5 里 WebMCP 的最佳实践给了同一个理由：工具定义吃 context 预算，数量一多模型就会「工具混淆 / 幻觉」。
- 结果体积上限：rich result 序列化 8 MiB，frame 8 MiB；*"Keep tool results small and honor `context.signal`."*
- `execute` 里的**授权责任在宿主**：*"Your callback must validate and authorize actions before executing them."*
- 超长工具结果走**句柄 + 按需读回**（`read_tool_result`），不直接塞进上下文 —— 与本仓「AI 调列表接口做统计」的场景强相关，**这条设计我建议直接抄**（见 §5.3）。

### 1.4 它的审批机制（**本次调研里最值得抄的部分**）

出自 <https://fx.sh/docs/configure-fx/permissions>：

- **三种模式**：`ask`（未命中规则的敏感工具调用先问人）/ `auto`（默认。先套规则，剩下的交给「自动审查模型」）/ `full-access`（关掉所有检查）。
- **通配符规则表**，**最后匹配者胜**，workspace 规则优先于 user 全局规则，规则按「先宽后窄」写：

```json
{
  "permission": {
    "*": "ask",
    "bash": { "git *": "allow", "git push *": "deny" },
    "edit": { "*": "deny", "docs/*": "allow" }
  }
}
```

- **`ask` 模式下的三选一审批语义**（比「同意 / 拒绝」两态更好用）：

| 选项 | 效果 |
|---|---|
| Yes | 本次执行，**不**创建授权 |
| Yes, and don't ask again | 执行，并为**当前展示的作用域**创建**会话级** grant（不落盘、`fx resume` 不恢复） |
| No | 不执行 |

- **fail-closed**：`auto` 模式下如果审查模型不可用（缺凭证 / 端点不可达），*"fx holds the action rather than executing it unreviewed"*。**这是我们要的行为**：审批链路出问题就不执行，而不是默认放行。
- 代价提示：`auto` 模式因为要多发一次模型请求，**可能比 `ask` 更贵**。

> **可直接落到我们项目的三条**：① 审批三态（本次/本次+会话内不再问/拒绝）；② 规则用「通配符 + 最后匹配胜」而不是一串 if；③ 审批链路异常 → 拒绝执行并提示，绝不静默放行。

### 1.5 来源

- <https://fx.sh/>（形态、v0.0.11、6.44 MiB、experimental 状态、Apache-2.0）
- <https://fx.sh/docs/lib>（`libfx`、`npm install libfx`、版本兼容说明）
- <https://fx.sh/docs/lib/webassembly>（JSPI 要求、Chrome/Edge 137+、Safari 27、浏览器 key 警告、WASM 运行时限制）
- <https://fx.sh/docs/lib/api.md>（`HostTool` / `RichToolResult` / 64 工具上限 / 体积上限 / 结果句柄）
- <https://fx.sh/docs/configure-fx/permissions>（三态模式、规则表、会话 grant、fail-closed）
- <https://fx.sh/docs/capabilities/tools>（内建工具清单、*"fx does not currently include interactive browser or CDP tools"*）
- <https://fx.sh/docs/lib/examples.md>（Browser agent 示例：plain HTML + `libfx/browser`）
- <https://api.github.com/repos/vercel-labs/fx>（3158★/357 fork/创建 2026-08-11/push 2026-09-26/245 issues/Apache-2.0）
- <https://registry.npmjs.org/libfx/latest>（0.0.11、0 deps、unpackedSize 36,444,499、exports 含 browser 入口）
- 交叉印证：AI SDK 把 fx 收进了 Harness 适配器清单 —— <https://ai-sdk.dev/providers/ai-sdk-harnesses/fx>

---

## 三、问题 2：Vercel AI SDK —— **结论：有条件可用，且是本项目唯一值得引入的 AI 依赖**

### 2.1 结论先行

| 事项 | 结论 |
|---|---|
| 当前稳定大版本 | **v7**。npm `ai@` **7.0.116**（Apache-2.0，`engines.node >= 22`）；`@ai-sdk/react@` **4.0.119**（peer `react: ^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1`，**本仓 lockfile 的 react 19.3.0 已满足**）；`@ai-sdk/openai@` **4.0.78**；`@ai-sdk/anthropic@` **4.0.65**；`@ai-sdk/openai-compatible@` **3.0.57**；`@ai-sdk/mcp@` **2.0.60**；`@ai-sdk/gateway@` **4.0.94**（默认 provider） |
| 我们在报告问题里预设的「v5」 | **已过时**。v5 引入的 `UIMessage` / `transport` / `useChat` 重构仍然是当前形态，但现在已是 v7；迁移指南链接见 §2.7 |
| 浏览器直连 OpenAI | **有条件可用**。官方 `openai@7.23.0` SDK 有 `dangerouslyAllowBrowser`（默认关闭、开启才允许浏览器）；AI SDK provider 层**没有该开关、也不做浏览器拦截**。**CORS 未确认**（本机不可达） |
| 浏览器直连 Anthropic | **有条件可用，且必须带一个 header**：`anthropic-dangerous-direct-browser-access: true`。依据是 `@anthropic-ai/sdk@0.128.0` 的 dist 源码（见 §2.4）。**CORS 未确认**（本机 403 无 ACAO） |
| OpenAI 兼容第三方 | **有条件可用**：`createOpenAICompatible({ name, apiKey, baseURL })`。**CORS 100% 取决于那家网关是否开 CORS**，我们不可控 |
| `inputSchema` 用 zod 还是 JSON Schema | **两者都行**。`jsonSchema()` helper 可直接吃 JSON Schema，**可以不引 zod** |
| 工具执行结果「人工确认后再继续」 | **官方支持**。v7 的 API 名是 **`toolApproval`**（`'user-approval'` / `'approved'` / `'denied'` / `'not-applicable'`）+ UI 侧 **`addToolApprovalResponse`** + **`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`**。旧的 `tool()` 上的 **`needsApproval` 已被官方标注 deprecated** |
| 纯浏览器就地跑（无后端） | **官方支持**：`DirectChatTransport`（把 `ToolLoopAgent` 直接喂给 `useChat`，无 HTTP） |

### 2.2 核心 API（v7 现状）

```ts
// 工具定义：inputSchema 收 Zod 或 JSON Schema；描述影响选工具
import { generateText, tool, isStepCount, jsonSchema } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model,
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({ location: z.string() }),   // 或 jsonSchema<...>({ type:'object', ... })
      execute: async ({ location }, { abortSignal }) => ({ location, temperature: 72 }),
    }),
  },
  stopWhen: isStepCount(5),   // 多步工具循环；默认 isStepCount(20)
  prompt: 'What is the weather in San Francisco?',
});
```

- **`maxSteps` → `stopWhen`**：v7 的内建停止条件有 `isStepCount(n)`（默认 `isStepCount(20)`）、`hasToolCall(...names)`、`isLoopFinished()`；可数组组合。`stopWhen` **只在最后一步含 tool result 时求值**。
- **`parameters` → `inputSchema`**：v7 的字段名是 `inputSchema`（报告问题里写的 `parameters` 是 v5 之前的旧名，见 §2.7 的 llms-full 混入旧文现象）。
- 其他实用开关：`activeTools`（限制本轮可用工具，对付工具过多）、`toolOrder`（稳定工具顺序以利 prompt cache）、`strict: true`（部分 provider 支持严格 schema）、`prepareStep`（逐步改 model/toolChoice/instructions/messages，可做上下文压缩 `pruneMessages`）。
- 生命周期回调：`onStepEnd`、`onToolExecutionStart` / `onToolExecutionEnd`，工具输入流式钩子 `onInputStart` / `onInputDelta` / `onInputAvailable`（**`onInputDelta` 只在 `streamText` 下触发**，正好用来画「正在生成工具参数」的 UI）。

**`useChat` / transport / `UIMessage`（回答「v5 变化」的现状）**：

```tsx
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

// 默认等价于 POST /api/chat
const { messages, sendMessage } = useChat();

// 自定义：api / headers / credentials / body 都支持函数形式（动态取 token）
const { messages: m2 } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/custom-chat',
    headers: () => ({ Authorization: `Bearer ${getAuthToken()}` }),
    body: () => ({ sessionId: getCurrentSessionId() }),
  }),
});
```

- 消息是 **`UIMessage`**，渲染走 **`message.parts`**（`text` / `reasoning` / `tool-<toolName>` / `file` / `source` / `data-*`），不再是 `content` 字符串 + `toolInvocations` 那套旧结构。
- 工具部件的状态机（审批 UI 靠它驱动）：`state === 'approval-requested'` 时读 `part.approval.id` / `part.approval.requestReason`，`state === 'output-available'` 时读 `part.output`。

### 2.3 浏览器直连：**不引官方厂商 SDK，也不存在 `dangerouslyAllowBrowser`**

这是本次最容易踩坑的一点，我做了全文 grep 而不是靠印象：

| 检查项 | 结果 |
|---|---|
| `grep -i "dangerouslyAllowBrowser" ai-sdk.dev/llms-full.txt`（6,174,349 B 全文） | **0 命中** |
| `grep -i "dangerously"` 同上 | **0 命中** |
| `grep -i "dangerously" @ai-sdk/openai@4.0.78/dist/index.js`（425,709 B） | **0 命中** |
| `@ai-sdk/provider-utils@5.0.49/dist/index.js` 里有 `isBrowserRuntime()`（`globalThis.window != null`） | **有**，且导出为公共函数，用于浏览器下的重定向校验分支 |

**结论**：AI SDK 的 provider（`@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/openai-compatible`）**自己实现 HTTP 调用、不依赖 `openai` / `@anthropic-ai/sdk` 这两个官方包**，因此**没有、也不需要** `dangerouslyAllowBrowser`。`dangerouslyAllowBrowser` 是**官方厂商 SDK** 的开关：

```js
// @anthropic-ai/sdk@0.128.0 dist/client.js —— 一手源码原文（已实测抓取）
// 1) 未开启时，在浏览器环境直接抛错：
if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
  throw new Errors.AnthropicError("It looks like you're running in a browser-like environment.\n\n
This is disabled by default, as it risks exposing your secret API credentials to attackers. ...");
}
// 2) 开启后才补上跨域所需的自定义头：
...(this._options.dangerouslyAllowBrowser
      ? { 'anthropic-dangerous-direct-browser-access': 'true' }
      : undefined),
'anthropic-version': '2023-06-01',
```

```ts
// 官方 openai@7.23.0 README 原文（Requirements 一节）
// "Web browsers: disabled by default to avoid exposing your secret API credentials.
//  Enable browser support by explicitly setting dangerouslyAllowBrowser to true."
// 并给出三条「何时不算危险」：Internal Tools / Public APIs with Limited Scope / Development or debugging purpose
```

**由此得到的可用写法（AI SDK 侧）**：

```ts
// Anthropic：AI SDK 的 createAnthropic 支持自定义 headers，把浏览器直连头挂上
import { createAnthropic } from '@ai-sdk/anthropic';
const anthropic = createAnthropic({
  apiKey: userKeyFromForm,
  headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
});

// OpenAI：baseURL / headers / fetch 可覆写；provider 层无浏览器拦截
import { createOpenAI } from '@ai-sdk/openai';
const openai = createOpenAI({ apiKey: userKeyFromForm });
// 注意：openai('model') 默认走 Responses API；若自定义 baseURL 只实现 Chat Completions，
// 要用 openai.chat('model')（官方文档原文提示）

// OpenAI 兼容第三方（自建/中转网关）
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
const provider = createOpenAICompatible({
  name: 'providerName',
  apiKey: userKeyFromForm,
  baseURL: 'https://api.provider.com/v1',
});
```

### 2.4 三家的 CORS 真实情况 —— **必须诚实标注为「未确认」+ 给出实测方法**

这是全篇唯一我**无法给出确定结论**的技术点，原因是本机网络：

| 厂商 | 本机实测（2026-09-27） | 判定 |
|---|---|---|
| OpenAI `api.openai.com` | `curl` 全部超时，`http_code=000`，exit 28 | **无法验证 → 未确认** |
| OpenAI `platform.openai.com` / `openai.com` | HTTP 403 | 文档站不可读 |
| Anthropic `api.anthropic.com` | POST 与 OPTIONS 均返回 **HTTP 403**，body `{"error":{"type":"forbidden","message":"Request not allowed"}}`；响应头**没有** `access-control-allow-origin`；带不带 `anthropic-dangerous-direct-browser-access` 结果一样 | **无法验证 → 未确认**。403 出现在 CORS 处理之前（地区/风控边缘拦截），因此**不能据此推断 CORS 被禁** |
| 第三方 OpenAI 兼容网关 | — | 取决于该网关，**必须逐个确认** |

**必须在上线前用真实浏览器做的实测（可直接抄）**：

```bash
# 预检（preflight）：看是否回 access-control-allow-origin / -methods / -headers
curl -i -X OPTIONS https://api.openai.com/v1/chat/completions \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"

# Anthropic 预检（注意 x-api-key / anthropic-version 也要在 allow-headers 里）
curl -i -X OPTIONS https://api.anthropic.com/v1/messages \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access"
```

> **给项目的兜底方案**：因为「无自有后端」是硬约束，一旦实测发现某家预检不通过，**必须走「使用者自建一层薄反向代理」**（Cloudflare Worker / 自建网关，只加 CORS 头与限流，不落 key）。这条要写进设置页的提示文案里，而不是让用户对着一个 CORS 报错自己猜。

### 2.5 API Key 暴露在浏览器里的风险（官方口径 + 本项目的判断）

- **官方口径**（openai README 原文）：浏览器「本质上比服务端不安全」，任何能访问浏览器的人都能提取凭据。**但**它明确列出了三条「可能不算危险」的情形：**Internal Tools**（受控内部环境 + 可信用户）、**Public APIs with Limited Scope**、**Development/debugging with short-lived credentials**。
- **本项目的实际情况**：这是一个 BYOK（使用者自填）的后台管理工具 —— key 属于使用者自己，不是我们的共享凭据；这正好落在官方说的「Internal Tools / 自担风险」一档。**因此浏览器直连是可接受的工程取舍，但必须做足告知**。
- **必做的三件事**：① 设置页明写「key 只存在本机浏览器，请求直连厂商，不经我们服务器；请使用权限最小化 / 可随时吊销的 key」；② **存储降级**——默认不持久化（内存或 `sessionStorage`），另给一个显式「记住」开关才落 `localStorage`（本仓 zustand persist 默认会落 localStorage，**不能默认落盘**）；③ 提供「清除 key」入口。
- **AI SDK 官方对审批安全的提醒（与本项目相关的部分）**：`useChat` 的标准形态下「消息历史是客户端可控输入」，因此服务端重建的审批可被伪造 —— 官方提供 `experimental_toolApprovalSecret`（HMAC 签名）来绑定审批。**在纯浏览器 + `DirectChatTransport` 形态下不存在这个服务端伪造面**（审批与执行都在同一个进程里，没有跨信任边界回放），所以**不需要**这个 secret；但如果将来改成「浏览器 → 我们的网关 → 模型」，**就必须补上**。

### 2.6 人工确认后继续（human-in-the-loop）—— v7 官方 API 原文

```ts
// 写法 A：单纯给某个工具挂「必须人工批准」
const result = await generateText({
  model, tools: { runCommand },
  toolApproval: { runCommand: 'user-approval' },
  prompt: 'Remove the most recent file',
});

// 写法 B：按输入动态决策（小额放行、大额要审批、非管理员直接拒）
toolApproval: {
  processPayment: async ({ amount }, { runtimeContext }) => {
    if (runtimeContext.role !== 'admin') return { type: 'denied', reason: 'Only admins can send payments' };
    return amount > 1000 ? 'user-approval' : undefined;   // undefined === 'not-applicable'
  },
}

// 写法 C：一个统一策略函数（推荐我们用这个，策略集中在一处）
toolApproval: ({ toolCall }) => {
  if (toolCall.dynamic) return 'user-approval';
  if (toolCall.toolName === 'deleteFile') return 'user-approval';
  return undefined;
},
```

四种状态（字符串或 `{ type, reason }` 对象）：

| 状态 | 语义 |
|---|---|
| `'not-applicable'`（默认） | 直接执行，不产生审批元数据 |
| `'approved'` | 记录一次自动批准，然后执行（输出里会出现 `isAutomatic: true` 的审批请求/响应） |
| `'denied'` | 记录自动拒绝，返回 denied 的工具输出 |
| `'user-approval'` | **发出审批请求并等待显式响应** |

**关键机制（决定了我们的 UI 怎么写）**：`generateText` / `streamText` **不会挂起**。第一次调用会在 `result.content` 里返回 `tool-approval-request` 部件；应用拿到用户决定后，把 `tool-approval-response` 追加进 messages，**再调一次**模型，此时才真正执行工具。

```ts
import { type ToolApprovalResponse } from 'ai';
for (const part of result.content) {
  if (part.type === 'tool-approval-request' && !part.isAutomatic) {
    approvals.push({
      type: 'tool-approval-response',
      approvalId: part.approvalId,
      approved: true,
      reason: 'User confirmed the command',
    });
  }
}
messages.push({ role: 'tool', content: approvals });
```

**UI 侧（`@ai-sdk/react`）** —— 这正是 `#/components/ai-panel` 内容区要写的东西：

```tsx
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
const { messages, addToolApprovalResponse } = useChat({
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
});

// part.type === `tool-${toolName}`
if (part.state === 'approval-requested' && !part.approval.isAutomatic) {
  // 渲染 part.approval.requestReason + 同意/拒绝按钮
  addToolApprovalResponse({ id: part.approval.id, approved: true });
}
```

**必读的两个坑（官方原文）**：
1. **`inputSchemaInput` 必须一起持久化**：当 schema 变换（transform）后的输入与呈现给用户审批的输入不同时，审批请求里会保留**变换前的原始输入**。续跑时 SDK 会用它重建输入并校验「与批准的值一致」，**永远不会用别的值替换已批准的值**；历史里缺这个字段会被判为非法工具输入。**注意**：*"A transform that removes a field does not redact it from approval metadata."* —— 也就是说**审批元数据里可能带着你以为已经脱敏的字段**，别把含敏感字段的 schema 变换当作脱敏手段。
2. **拒绝后要在 system instruction 里明确「不要重试」**，否则模型会反复发起同一个审批请求。

**与 `needsApproval` 的关系（避免装错版本）**：`needsApproval` 是**旧的 `tool()` 属性，现已 deprecated**，官方原文 *"The older `needsApproval` property on `tool()` definitions is deprecated. Existing code still works, but new code should move approval logic to `toolApproval`."* 只有 `WorkflowAgent` 才仍然使用 `needsApproval`（用于挂起 / 恢复持久化工作流）。**新代码一律用 `toolApproval`。**

### 2.7 纯浏览器就地跑：`DirectChatTransport`

这是本项目「无 Node 后端」的关键拼图 —— 把 Agent 直接接进 `useChat`，**完全没有 HTTP 层**：

```tsx
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent, tool } from 'ai';

const agent = new ToolLoopAgent({
  model: openai('gpt-6-astra'),        // 浏览器直连（BYOK）
  instructions: 'You are a helpful assistant.',
  tools: { /* 我们的工具表 */ },
  toolApproval: { /* 我们的审批策略 */ },
});

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DirectChatTransport({ agent }),
  });
  // ...
}
```

官方对该 transport 的定位原文包含 *"Single-process applications: Desktop or CLI apps where client and agent run together"*。能力边界：`reconnectToStream()` **恒返回 `null`**（没有服务端流可重连）→ **刷新页面 = 对话丢失**，与本仓「AI 面板展开状态刻意不持久化」的现状一致，可以接受，但要在文案上让用户预期一致。

**注意 `llms-full.txt` 里混着旧版文档**：6.1 MB 的全文文件里同时存在 v5 时代的内容（`maxSteps`、`parameters`、`toDataStreamResponse`、`needsApproval` 的「Client-Side Approval UI」示例）。**以 `ai-sdk.dev/docs/**/*.md` 的 `.md` 单页为准**，不要照抄 llms-full 里那些片段。

### 2.8 `inputSchema` 用 JSON Schema，避免引 zod

官方原文：*"`inputSchema`: A Zod schema or a JSON schema that defines the input parameters."*，且有独立 helper 页：

```ts
import { jsonSchema } from 'ai';

const mySchema = jsonSchema<{
  recipe: { name: string; ingredients: { name: string; amount: string }[]; steps: string[] };
}>({
  type: 'object',
  properties: { /* 标准 JSONSchema7 */ },
  required: ['recipe'],
});

// 需要运行时校验时可挂第二个参数：
jsonSchema<...>(schema, { validate: (value) => /* {success,value} | {success,error} */ });
```

配套事实：`ai@7.0.116` 的 `peerDependencies` 是 **`zod: ^3.25.76 || ^4.1.8`** —— zod 是 peer 依赖。**本仓情况（已实测）**：`zod@4.6.5` 已经因为 `@cloudflare/kumo@2.14.0` 的 peer 存在于 pnpm store 中，**版本上满足 AI SDK 的 peer 范围，不会引入新的大版本族**；但它没有 hoist 到根 `node_modules/zod`，所以：
- **只用 `jsonSchema()`（不 import zod）时**：pnpm 的 `auto-install-peers`（默认开）会为 `ai` 补装匹配的 zod，`pnpm install` 不应报错 → **可以直接走 JSON Schema 路线**；
- **若我们想自己写 zod schema**：需要把 `zod` 提升为直接依赖（`zod@4.6.5` 即可）。
→ 落地第一步仍是**实测一次「不装 zod 直接 `pnpm install ai`」**，确认 pnpm 不报 peer 缺失；**能用 JSON Schema 就优先用**，因为 `packages/api-client/src/generated/schemas.gen.ts` 里已经有现成的 `as const` JSON Schema，可直接喂给模型，零重复定义。

### 2.9 来源

- 版本与许可：<https://registry.npmjs.org/ai/latest>、<https://registry.npmjs.org/@ai-sdk/react/latest>、<https://registry.npmjs.org/@ai-sdk/openai/latest>、<https://registry.npmjs.org/@ai-sdk/anthropic/latest>、<https://registry.npmjs.org/@ai-sdk/openai-compatible/latest>、<https://registry.npmjs.org/@ai-sdk/mcp/latest>、<https://registry.npmjs.org/@ai-sdk/gateway/latest>
- 工具调用 / `stopWhen` / `toolApproval` / `inputSchema`：<https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling.md>
- 人工审批（`toolApproval` 四态、`addToolApprovalResponse`、`inputSchemaInput`、`experimental_toolApprovalSecret`、`needsApproval` deprecated）：<https://ai-sdk.dev/docs/agents/tool-approvals.md>
- `jsonSchema()`：<https://ai-sdk.dev/docs/reference/ai-sdk-core/json-schema.md>
- transport / `DirectChatTransport`：<https://ai-sdk.dev/docs/ai-sdk-ui/transport.md>、<https://ai-sdk.dev/docs/reference/ai-sdk-ui/direct-chat-transport.md>
- OpenAI provider（`createOpenAI` / `baseURL` / `headers` / `openai.chat()` / Responses 默认）：<https://ai-sdk.dev/providers/ai-sdk-providers/openai.md>
- Anthropic provider（`createAnthropic` / `headers` / `baseURL` / effort / thinking）：<https://ai-sdk.dev/providers/ai-sdk-providers/anthropic.md>
- OpenAI 兼容 provider：<https://ai-sdk.dev/providers/openai-compatible-providers.md>
- 迁移指南（确认当前为 v7）：<https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0>、<https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0>、<https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0>
- 官方厂商 SDK 的浏览器开关（一手）：<https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/README.md>、`https://unpkg.com/@anthropic-ai/sdk@0.128.0/client.js`（源码内 `anthropic-dangerous-direct-browser-access` / `dangerouslyAllowBrowser` / `isRunningInBrowser`）、<https://raw.githubusercontent.com/openai/openai-node/master/README.md>

---

## 四、问题 3：Beautiful UI 的 thinking-state —— **结论：不能直接依赖（没有可安装形态），但可以低成本复刻**

### 3.1 结论先行

| 事项 | 结论 |
|---|---|
| 形态 | **Next.js 站点上的一组「copy-paste 组件」**，官网自述 *"copy-paste components for chat agents, thinking states, human-in-the-loop approvals, and everything agents need to talk to humans"*。**不是 npm 组件库，不是 shadcn registry**（首页 HTML 全文检索 `shadcn` / `npx` / `registry` 安装指令：**零命中**，只有源码注释里的 "registry parity"。**`npm` 上也没有对应包**，`beautifului.dev/llms.txt` 返回 404） |
| License | **MIT**。`/license` 页原文标题 *"Yes, you can use it for free."*，正文 `MIT License — Copyright (c) 2026 Shane Levine`。页脚链接 `/license` 标签即 "MIT License" |
| 作者 | Shane Levine / **TurboProduct design studio**（页脚外链 `turbodesign.co`，并挂 cal.com 预约） |
| 组件数 | 官网页脚与镜像 README 均指向 **19 个**（Loading State / Thinking / Streaming Text / **Approval Card** / Tool Chips / Task Rows / Chat / Prompt Bar / Recommendation Card / Context Cards / Diff Table / Records Table / Filter Table / Sidebar Nav / Search / Flowchart / Insight Cards / Code Block / Fine-tune Card / Selection Actions —— 首页导航实际列出 21 项，其中 `flowchart`、`agent-screen` 未进入镜像的 19 个文件，**以源码提取结果为准**） |
| 依赖 | 全部为 **React**（组件顶部 `"use client"`，React 18+ 即可，React 19 无冲突）；**不用 motion / framer-motion**，`ThinkingState` 是**纯 CSS + inline style**。跨组件依赖：`InsightCards` → **`liveline`**（实时动画图表），`PromptBar` → **`glimm`**（WebGL sweep 过渡，需 `npm i liveline glimm`） |
| Tailwind 版本 | 源码用的是 Tailwind v4 风格的自定义语义类与任意值（`max-w-95`、`duration-400`、`rounded-control`），**没有 `tailwind.config.js` 依赖**。但**不是 Tailwind 内置色板**，见 3.2 |
| 能否只取 thinking 那一个组件 | **可以「只抄那一个」**（源码独立、无跨组件 import、`variant` 参数自包含），**但没有官方安装通道** → 只能自己下载 / 从 RSC payload 提取后改写 |
| 第三方提取镜像（可参考，不建议依赖） | `grxtory/beautifului-mirror`（MIT，0 ★，创建 2026-08-13，19 个 `components/*.tsx`）。README 自述*「从站点自己的 RSC payload 提取（2026-08-12）」*，并标注已知缺口：`SelectionActions.tsx` 依赖**不存在于公开 registry** 的 `@/components/atoms/Shimmer` 与 `@/components/atoms/StreamText`（*"You must supply these (recreate or fetch from a paid/pro version of the site)"*）；import 路径统一是 `@/components/...` |

### 3.2 为什么不能直接粘进来（三条改造量，来自源码实测）

`ThinkingState.tsx` 的 className 大量使用**该站点自研的语义令牌**，与本仓 Kumo 令牌体系**名字不同、语义相近**：

| 站点用 | 本仓应映射到 |
|---|---|
| `text-ink` / `text-ink-2` / `text-ink-3` | `text-kumo-default` / `text-kumo-subtle` / `text-kumo-subtle`（需要按层级再细分） |
| `border-line` / `border-line-strong` / `bg-line` | `border-kumo-line` / `border-kumo-line` / `bg-kumo-line` |
| `bg-hover` / `bg-hover-2` / `bg-inset` | `bg-kumo-tint` / `bg-kumo-tint` / `bg-kumo-control` |
| `bg-accent` / `text-green` / `text-red` / `bg-orange` | 需按 Kumo 语义化状态色（无 accent 概念，本仓禁用 `dark:`，颜色统一走令牌） |
| `rounded-control` | Kumo 圆角令牌（非 Tailwind 默认） |
| `max-w-95`、`duration-400` | Tailwind v4 任意值，可直接用；若 v4 未生成 `duration-400` 需换成 `duration-[400ms]` |
| 动画 `shimmer-text` / `fade-up` / `fade-in` / `spin` | **必须自己补 `@keyframes`**（站点在自己全局 CSS 里定义，源码内没有） |

第二条改造量：**全组件没有任何 `prefers-reduced-motion` 处理**（动画全部无条件播放）。本仓 `AGENTS.md` 要求过渡一律包在 `motion-safe:` 里 → **照抄会违反本仓约定**，必须自己补。

第三条：源码里 `useSequence` 的 stage 计时器**只用于演示**（`setTimeout` 链），真实接入时应由 `useChat` 的流式事件驱动（`onInputDelta` / `reasoning` part / tool part 状态）而不是定时器。

### 3.3 复刻规格（精确到数值，可直接照着实现）

以下全部**逐行取自 `ThinkingState.tsx` 源码**：

**节奏（演示用，真实接入改由流驱动）**
```
STAGES = [800, 600, 1800, 2600, 1600]   // ms，stage 0..4
working = stage < 3                      // 前 3 段处在「进行中」
autoExpanded = stage >= 1 && stage < 4    // 展开→收起，跑完留在收起态
expanded = manualExpanded ?? autoExpanded // 用户手动点过后以手动为准
visible = stage < 2 ? 0 : stage === 2 ? min(2, rows.length) : rows.length
```

**头部（一行，左边图标 + 文案 + 右侧 caret）**
- 文案**两种状态切换**：
  - `working === true` → `active`：`Thinking` / `Searching the web` / `Running tools`（13px / `font-medium`）
  - `working === false` → `done`：`Thought for 4 seconds` / `Searched the web` / `Ran 3 tools`
- 进行中的文字是**渐变 shimmer**：`background-image: linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)`，`background-size: 200% 100%`，`bg-clip-text text-transparent`，`animation: shimmer-text 1.4s linear infinite`。
  → 切换时 done 文案用 `fade-in 350ms ease-out both` 淡入。
- 左侧是四角星 svg（`fill` 在 working 时是 `--ink-2`、否则 `--ink-3`）。
- caret：`transition-transform duration-300`，`expanded ? rotate(180deg) : rotate(0)`。
- 整个头部是 `<button type="button" aria-expanded={expanded}>`，`-mx-1.5 px-1.5 py-1 rounded-control hover:bg-hover-2 transition-colors duration-100`。

**展开容器（grid-rows 高度动画，无 JS 测高）**
```
display: grid
transition: grid-template-rows, opacity 400ms cubic-bezier(0.23, 1, 0.32, 1)
grid-template-rows: expanded ? '1fr' : '0fr'
opacity: expanded ? 1 : 0
内层 overflow-hidden
```

**左侧时间线竖线**：`absolute left-[3px] w-px bg-line`，`top: -8`，高度由 `useLayoutEffect` 实测 trace 容器 `offsetHeight` 得到（`height - 2`），`transition: height 500ms cubic-bezier(0.23,1,0.32,1)`。列表容器 `relative mt-1 ml-[5px] pl-4 flex flex-col gap-1 py-1`。

**每行**：`flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left`，入场 `animation: fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 120}ms both` —— **逐行 120ms 阶梯延迟**。字号：主文案 12.5px，`Reasoning` 变体改 `whitespace-normal leading-relaxed text-ink-2`（其余 `font-medium text-ink`），次要信息 11.5px `text-ink-3`（`mono` 行用 `font-mono`），diff 用 11px `font-mono tabular-nums`（绿 `+n` / 红 `−n`）。

**四个变体（`variant`）**

| 变体 | active / done 文案 | 行首标识 | 特殊交互 |
|---|---|---|---|
| `Steps` | `Thinking` / `Thought for 4 seconds` | 未完成行是 3px 圆环 spinner（`border-t-ink-2`，`animation: spin 700ms linear infinite`），完成行是`--ink-3` 对勾 | — |
| `Reasoning` | 同上 | 无 | 整行散文（`whitespace-normal leading-relaxed`） |
| `Search` | `Searching the web` / `Searched the web` | 三色地球圆点（`TONES = ['bg-accent','bg-orange','bg-green']`，`i % 3` 轮换） | 顶部有 **query 行**（放大镜 + 查询词，12.5px，`fade-up 300ms both`）；每行是 `<a target="_blank" rel="noreferrer">` 外链 + `hover:bg-hover`；`stage >= 3` 时末尾追加 `+7 more`（12px，`fade-in 300ms both`）；主文案带 `animated-underline` |
| `Coding` | `Running tools` / `Ran 3 tools` | 无 | 每行是 `<button aria-pressed={selected}>`，选中态 `bg-inset`（其余 `hover:bg-hover`）；行内有 `Read/Edit/Run` + 等宽文件名 + `+74 −41` |

**容器**：`flex min-h-[176px] w-full max-w-95 flex-col`，`key={variant}`（切变体时重置整个组件）。

**本仓投影建议**：`ThinkingState` 的视觉可以考虑用 Kumo 令牌重写成一个 `AiThinkingTrace`，**但 `visible` 的渐进显行 + 阶梯 fade-up 是对「LLM 正在逐步干活」最有效的表达**，值得保留；动画统一包 `motion-safe:`。

### 3.4 附：`Approval Card` 更值得看

首页第 04 项 `Approval Card` 的自述是 *"Human-in-the-loop questions the agent asks before acting."*，交互是**单问题 + 2~3 个选项 + `1 / 3` 进度 + Skip / Continue 双按钮**。这**正好是 §2.6 里 `tool-approval-request` 要渲染的东西** —— 建议**优先级高于 thinking-state**：thinking 只是好看，Approval Card 是功能必需的 UI 骨架。（`ApprovalCard.tsx` 亦在镜像里，10,478 B。）

### 3.5 来源

- <https://www.beautifului.dev/>（组件清单与定位原文；首页 HTML 检索 install 指令零命中）
- <https://www.beautifului.dev/license>（MIT 全文，Copyright (c) 2026 Shane Levine）
- `https://www.beautifului.dev/` 首页 HTML（页脚 `href="/license"` 文案 "MIT License"；`href="/harness"` 文案 "Ice Cream Harness"；外链 `turbodesign.co`）
- <https://github.com/grxtory/beautifului-mirror>（README：19 个组件、MIT、提取方式、`liveline` / `glimm` 依赖、`SelectionActions` 缺内部 atoms；`components/ThinkingState.tsx` 全文源码）
- `https://www.beautifului.dev/llms.txt` → **404**（确认无 LLM/安装索引）

---

## 五、问题 4：浏览器内「MCP-like 工具层」的既有实现 —— **结论：WebMCP 现在不能用；MCP SDK 不要引；用 AI SDK 自带的工具模型即可**

### 5.1 WebMCP 现状（确认「现在不能用」）

| 事项 | 一手事实 |
|---|---|
| 规范状态 | 标题即 **"WebMCP — Draft Community Group Report, 26 September 2026"**。原文：*"This specification was published by the Web Machine Learning Community Group. **It is not a W3C Standard nor is it on the W3C Standards Track.**"* → **Editor's Draft 级别的 CG 报告，不是 WD/CR/Rec** |
| 归属 | W3C **Web Machine Learning Community Group**；仓库 `webmachinelearning/webmcp`（4,306 ★ / 297 fork，最近 push 2026-09-26，Bikeshed 源码）；规范地址 <https://webmachinelearning.github.io/webmcp/>；Issue 跟踪在 GitHub |
| Chrome | **Chrome 149 Origin Trial**（`developer.chrome.com/blog/ai-webmcp-origin-trial`）；本地开发需 `about:flags#enable-webmcp-testing`；有 Chrome Status 条目与 Intent to Experiment |
| Edge | **Edge 150 Origin Trial**，平台支持参考 Chrome 实现 |
| 其他 | **ChatGPT Desktop 已支持**；Brave 在 Leo AI chat 里有实验性支持；**Firefox 与 Safari 只有 standards-positions issue / Bugzilla 条目，无实现** |
| 今天的可用性 | **Chrome/Edge stable 不可用**：只有 Origin Trial（需要为站点申请 token 才生效）+ DevTools flag。**结论：与「现在不能用」判断一致** |

**关键 API 名（以官方 README 原文为准，注意与旧名不同）**：

```js
// 注册（可被 AbortSignal 注销 —— 动态工具生命周期）
const controller = new AbortController();
await document.modelContext.registerTool({
  name: 'add-todo',
  description: 'Add a new item to the user\'s active todo list',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  async execute({ text }) {
    await addTodoItemToCollection(text);
    return { content: [{ type: 'text', text: `Added todo item: "${text}" successfully.` }] };
  },
}, { signal: controller.signal });
controller.abort();  // 注销

// 跨源暴露给「作者自带的 agent」
registerTool(tool, { exposedTo: ['https://trusted-partner.example'] })

// 发现与执行
const tools = await document.modelContext.getTools({ fromOrigins: ['https://trusted-partner.example'] });
await document.modelContext.executeTool(tool, input, { signal });
document.modelContext.addEventListener('toolchange', async () => { /* 刷新工具表 */ });
```

- **命名**：现行 README 一律写 **`document.modelContext.*`**（`registerTool` / `getTools` / `executeTool` / `toolchange`）。社区库里仍能看到 `navigator.modelContext` 的历史痕迹（如 `agentcathq/webmcp-react` 的 topics 里有 `navigator-modelcontext`）→ **这类旧名不要照抄**。
- **iframe 与权限**：默认在 top-level `Window` 与同源 iframe 可用；跨源 iframe 需 Permissions Policy `allow="tools"`（或 `Permissions-Policy: tools=()` 显式关闭）。权限被拒时 `registerTool()` 以 `NotAllowedError` DOMException 拒绝。
- **还有声明式（declarative）形态**：从 `<form>` 元素自动合成工具，见 `declarative-api-explainer.md`。
- **类型定义**：npm **`webmcp-types@0.1.9`**（MIT）。

**WebMCP 官方「最佳实践」里 4 条我们立刻能用的（这些不依赖浏览器实现）**：
1. **工具要有预算意识**：每个工具（name + description + schema）都吃 token、涨延迟、增幻觉；**几十上百个工具会显著退化**。→ 对应 fx 的 64 上限、MCP 的 tool search。
2. **动态注册**：只注册当前页面状态相关的工具，离开就 `abort()` 注销。→ **对我们极其适用**：在用户详情页才注册 `getUserDetail`，在列表页才注册 `filterUsers`。
3. **语义命名区分「立即执行」与「发起流程」**：`create-event`（立刻建）vs `start-event-creation`（导航到表单）。→ 正好回答我们的「AI 该不该直接提交」。
4. **schema 里宽松、代码里严格**：schema 约束过严会让 agent 卡死；详细校验放在 `execute` 里并**返回可自我纠正的错误信息**。
5. （安全）官方要求「提供人机确认」：*"Present confirmation prompts to the user for operations, to ensure a human is in the loop."*

### 5.2 `@modelcontextprotocol/sdk` 能否在浏览器用 —— **结论：不要引；只用数据模型这条路「可行但没必要」，因为 AI SDK 已经包好了**

**版本现状（重要，v1 已是 legacy）**

| 包 | 版本 | 许可 | 说明 |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | **1.30.1** | MIT | **v1 世代**，仓库 `main` 分支 README 已明确：*"This is the `main` branch — v2 of the SDK … implementing the 2026-07-28 MCP spec"*，v1 只继续收 bug/安全修复（"at least 6 months after v2's release"）。依赖里含 `express` / `hono` / `cors` / `@hono/node-server` / `cross-spawn` / `raw-body` / `express-rate-limit` —— **明确是服务端取向**，`package.json` **没有 `browser` 字段** |
| `@modelcontextprotocol/client` | **2.1.0** | MIT | v2 拆包后的客户端包。依赖 `zod` / `jose` / **`cross-spawn`** / `eventsource` / `eventsource-parser` / `pkce-challenge` / `@modelcontextprotocol/core`；`engines.node >= 20`；**无 `browser` 字段**；exports 有 `./stdio`、`./validators/cf-worker` |
| `@modelcontextprotocol/server` | **2.1.0** | MIT | 服务端包 |
| `@modelcontextprotocol/core` | **2.1.0** | MIT | **依赖只有 `zod`**，exports 只有 `.` 与 `./internal` —— **这是「只要数据模型」最干净的候选** |

**逐条回答原始问题**：

1. **stdio 传输显然不行**（要起子进程）。✓ 与判断一致。
2. **HTTP / SSE 传输在浏览器里能用吗？** —— v2 官方 README 的能力表述是 *"It runs on Node.js, Bun, and Deno"*，**没有提 browser**；包里也没有 `browser` 字段/浏览器构建；`cross-spawn` 是硬依赖（虽然理论上只被 `./stdio` 引用）。→ **结论：官方不支持浏览器，能不能跑取决于打包期 tree-shaking，属于「未确认 + 有打包风险」**。
3. **「只想要它的工具/资源数据模型，不要传输层」这条路可行吗？** —— **可行**：`@modelcontextprotocol/core@2.1.0` 依赖只有 `zod`，是最干净的数据模型入口；V2 还改用 **Standard Schema**（*"bring Zod v4, Valibot, ArkType, or any compatible library"*）。**但没必要** —— 见下条。
4. **AI SDK 已经把这件事做完了**：`@ai-sdk/mcp@2.0.60`（Apache-2.0）的 `createMCPClient` 支持 `transport: { type: 'http' | 'sse' }`（**HTTP-only，无 stdio 依赖**），并且把 MCP 的 annotations 与审批策略打通了。**如果我们只是要「工具描述 + 权限标注 + 审批」，用 `@ai-sdk/mcp` 或干脆自己写 30 行类型更划算。**

> **打包风险提示（未确认）**：`@ai-sdk/mcp@2.0.60` 的 `dependencies` 里也有 **`cross-spawn`**，且**没有 `browser` 字段**。它大概率只被 `./mcp-stdio` 子路径引用（主 entry `.` 不引用），但**必须在 Vite 8 下实测打包**。如果 `pnpm build` 报 Node 内置模块解析失败，退路是：**完全不用 `@ai-sdk/mcp`**，自己定义工具类型（参考 §5.3 的字段清单），因为我们本来就不连任何外部 MCP server。

### 5.3 现成的「前端注册工具 + JSON Schema + 权限标注 + 人工审批」实现清单

#### (a) MCP 规范本身的 `annotations` —— **这是我们该抄的字段清单**

MCP 2025-11-25 `/server/tools` 与 `/schema` 的 `ToolAnnotations` 原文定义：

```
Tool {
  name: string                 // 1–128 字符；建议仅 [A-Za-z0-9_-.]，区分大小写，server 内唯一
  title?: string               // 人类可读显示名（显示优先级：title > annotations.title > name）
  description: string
  icons?: Array<{ src, mimeType?, sizes? }>
  inputSchema: object          // JSON Schema（无 $schema 时默认 2020-12）；无参数工具推荐
                               //   { "type":"object", "additionalProperties": false }
  outputSchema?: object        // 可选；给了就必须返回符合它的 structuredContent
  annotations?: ToolAnnotations
  execution?: { taskSupport: 'forbidden' | 'optional' | 'required' }   // 默认 forbidden
}

ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}
```

**规范原文的两条硬约束**：
- 工具执行错误与协议错误要分开：执行错误用 `{ content: [...], isError: true }` 返回，**要让模型能据此自我纠正重试**；协议错误（未知工具、结构不合法）才用 JSON-RPC error。
- **`annotations` 是不可信提示**：*"clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers."* → **不能把 `readOnlyHint: true` 当成免审批的充分条件**（AI SDK 文档也是这个口径：annotations 只做输入，策略要自己定）。

#### (b) AI SDK 官方的「MCP annotations → 审批」策略示例（可直接抄）

出自 <https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools.md>，**保守策略**：只有服务端明确标了只读才自动放行，其余一律要人批：

```ts
import { type McpProviderMetadata } from '@ai-sdk/mcp';

const result = await streamText({
  model: __MODEL__,
  tools,
  toolApproval: ({ toolCall }) => {
    const annotations = (toolCall.toolMetadata as McpProviderMetadata | undefined)?.annotations;
    return annotations?.readOnlyHint === true
      ? 'not-applicable'
      : {
          type: 'user-approval',
          reason:
            annotations?.destructiveHint === true
              ? 'The MCP server marks this tool as destructive.'
              : 'The MCP server does not mark this tool as read-only.',
        };
  },
  prompt,
});
```

annotation 的暴露位置：每个工具的 `metadata.annotations`，以及工具调用的 `toolMetadata.annotations`。

#### (c) 另外两个值得看的官方机制（都在 AI SDK 里，不必自己造）

| 机制 | 作用 | 来源 |
|---|---|---|
| `fingerprintTools(tools)` + `detectToolDrift(current, baseline)` | 把工具的 `description` / 解析后的 `inputSchema` / `title` 摘要成稳定指纹，之后再取一次做 diff，**检测「rug pull」式的工具定义篡改**（描述里注入指令、schema 被悄悄加宽）。官方说得很清楚：它**检测不到**「名字/描述/schema 都不变、只换后端行为」的替换。baseline 的持久化与如何响应漂移（阻断 / 强制重批 / 告警）由应用自己定 | 同上 |
| `experimental_listPrompts` / `experimental_getPrompt` / `listResources` / `readResource` / `complete` / `onElicitationRequest` | 资源（application-driven）、提示模板、补全、以及 elicitation（服务端反过来问用户要输入，返回 `accept` / `decline` / `cancel` 三态） —— **我们的「填表单前问用户」可以参考 elicitation 的三态语义** | 同上 |

#### (d) 其他可参考的开源实现（**只作设计参考，不建议引入**）

| 名称 | 链接 / 许可 | 参考价值 |
|---|---|---|
| `webmachinelearning/webmcp` | <https://github.com/webmachinelearning/webmcp> ，4,306 ★ | 规范 + **Best Practices**（工具预算、动态注册、语义命名、宽松 schema 严格代码）；工具字典形状 `{ name, description, inputSchema, origin, window }` 与我们需要的几乎一致 |
| `GoogleChromeLabs/webmcp-tools` | <https://github.com/GoogleChromeLabs/webmcp-tools> ，**Apache-2.0**，624 ★，push 2026-09-23 | Chrome 官方的开发者工具与 demo 套件（"designed to support the adoption of the WebMCP API"），可作为 API 用法的权威样例 |
| `MiguelsPizza/WebMCP`（MCP-B / mcp-b.ai） | <https://github.com/MiguelsPizza/WebMCP> ，**许可 NOASSERTION（非标准 license，引入前必须人工确认）**，1,099 ★ | 在浏览器里跑 MCP 的完整实现（页面/扩展传输），是「纯前端工具层」最完整的参考实现；**但许可不明，只能读不能抄** |
| `agentcathq/webmcp-react` | <https://github.com/agentcathq/webmcp-react> ，**MIT**，74 ★，push 2026-09-23 | **React hooks 形态的 WebMCP 注册**（把工具注册与组件生命周期绑定），对我们的「按页面注册工具」思路直接可借鉴 |
| `nekuda-ai/webmcp-kit` | <https://github.com/nekuda-ai/webmcp-kit> ，**MIT**，40 ★ | 一个 coding-agent 插件（给 Claude Code / Codex 用），把 WebMCP 工具加进你的 web app |
| ✗ LangChain / LangGraph `interrupt` + human-in-the-loop | — | **不推荐**：它是 Python/JS 图编排范式，与本项目的 React 状态模型不契合；引入等于同时引两套 agent 抽象 |
| ✗ OpenAI Apps SDK / ChatGPT Apps | — | **不适用**：面向 ChatGPT 宿主内的 app，不是「我们自己页面里调模型」 |
| ✗ Claude Code 的 allow/deny/ask 规则 | <https://code.claude.com/docs/en/auto-mode-classifier-billing>（AI SDK Anthropic provider 文档引用） | **设计可抄、代码不可抄**：它的 `permission_mode: 'auto'` + 服务端 `dangerous_tool_use` 分类器（返回 `not_flagged` / `flagged` + 解释）是 §1.4 fx 那套「自动审查」的同类物。AI SDK 已暴露入口：`providerOptions.anthropic.safeguards = [{ type: 'dangerous_tool_use', classifierContext: { v: 1, permission_mode: 'auto' } }]`，结果在 `providerMetadata.anthropic.safeguardResults`。**依赖 Anthropic beta，且我们没有后端，属可选增强** |

### 5.4 来源

- WebMCP 规范状态 / API / 最佳实践：<https://raw.githubusercontent.com/webmachinelearning/webmcp/main/README.md>、`https://webmachinelearning.github.io/webmcp/`（status 段原文）、<https://raw.githubusercontent.com/webmachinelearning/webmcp/main/implementation-status.md>（Chrome 149 OT / Edge 150 OT / flag / ChatGPT Desktop / Brave / Firefox / Safari）
- WebMCP 仓库元数据：<https://api.github.com/repos/webmachinelearning/webmcp>（4306 ★，push 2026-09-26，license NOASSERTION）
- MCP 工具与 annotations：<https://modelcontextprotocol.io/specification/2025-11-25/server/tools.md>、`https://modelcontextprotocol.io/specification/2025-11-25/schema.md`（`ToolAnnotations` 字段）、<https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md>（上一版对照）
- MCP TypeScript SDK 版本/拆包/许可：<https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md>、<https://registry.npmjs.org/@modelcontextprotocol/sdk/latest>、<https://registry.npmjs.org/@modelcontextprotocol/client/latest>、<https://registry.npmjs.org/@modelcontextprotocol/server/latest>、<https://registry.npmjs.org/@modelcontextprotocol/core/latest>
- AI SDK 侧 MCP + annotations + 审批策略 + tool drift：<https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools.md>
- `webmcp-types`：<https://registry.npmjs.org/webmcp-types/latest>（0.1.9，MIT）
- 其他仓库：<https://api.github.com/search/repositories?q=webmcp>（`GoogleChromeLabs/webmcp-tools` Apache-2.0 624★、`MiguelsPizza/WebMCP` NOASSERTION 1099★、`agentcathq/webmcp-react` MIT 74★、`nekuda-ai/webmcp-kit` MIT 40★）

---

## 六、对本项目的建议

### 6.1 值得引入

| 依赖 | 版本（2026-09-27） | 许可 | 理由 / 注意 |
|---|---|---|---|
| **`ai`** | 7.0.116 | Apache-2.0 | 核心：`streamText` / `tool()` / `stopWhen` / **`toolApproval`** / `jsonSchema()` / `DirectChatTransport`。peer 依赖 `zod ^3.25.76 \|\| ^4.1.8` —— **本仓已有 `zod@4.6.5`（kumo 的 peer），版本上已满足**；只用 `jsonSchema()` 时预计 pnpm 自动补 peer（见 2.8，仍建议实测一次 `pnpm install`） |
| **`@ai-sdk/react`** | 4.0.119 | Apache-2.0 | `useChat` + `addToolApprovalResponse` + `sendAutomaticallyWhen`。peer `react: ^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1` —— **本仓 lockfile 实际是 react 19.3.0，已满足，无冲突**（早前基于 `package.json` 的 `^19.2.0` 产生的担心不成立） |
| **`@ai-sdk/openai`** | 4.0.78 | Apache-2.0 | BYOK 直连 OpenAI；`openai.chat()` 用于只支持 Chat Completions 的自定义 baseURL |
| **`@ai-sdk/openai-compatible`** | 3.0.57 | Apache-2.0 | **实际最可能用上的那个**：走使用者自己的中转网关 / 自建代理 / 国内兼容服务。`createOpenAICompatible({ name, apiKey, baseURL })` |
| （可选）`@ai-sdk/anthropic` | 4.0.65 | Apache-2.0 | 若确定要支持 Claude 直连；需要 `headers: { 'anthropic-dangerous-direct-browser-access': 'true' }` |
| （可选，先用不装）`@ai-sdk/mcp` | 2.0.60 | Apache-2.0 | **只有当我们以后要连外部 MCP server 时才需要**。它跑 `transport: { type: 'http' }` 并能把 MCP annotations 映射到 `toolApproval`。⚠️ 依赖里含 `cross-spawn` 且无 `browser` 字段 → **先不装，等有真实需求再实测打包** |
| （可选）`zod` | 直接用已存在的 **4.6.5** | MIT | **本仓已通过 `@cloudflare/kumo` 的 peer 在树里**（`node_modules/.pnpm/zod@4.6.5`），但未 hoist 到根。需要用 zod 写 schema 时把它提升为直接依赖即可，**不引入新版本族**；不用 `jsonSchema()` 就能满足需求时则不必显式声明 |

**明确不引入**：`libfx`（§1.2）、`@modelcontextprotocol/sdk` / `@modelcontextprotocol/client`（§5.2）、`liveline` / `glimm`（只为 Beautiful UI 两个非 AI 核心组件，不值得）、`@ai-sdk/gateway`（我们不做 Vercel 托管，BYOK 直连即可）。

### 6.2 自己写（不该找现成库的部分）

1. **工具注册表 + 权限标注的数据模型**。建议照 MCP 的字段形状定义（一次定义，将来接 MCP 零改造）：

```ts
// 建议放在 apps/web/src/lib/ai/tool-types.ts（示意，非最终命名）
type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};
type AdminTool = {
  name: string;                        // 仅 [A-Za-z0-9_-]，1–64 字符，全局唯一
  description: string;                 // 双语（走 i18n），说明「做什么 / 何时用」
  inputSchema: Record<string, unknown>; // JSON Schema：可复用 schemas.gen.ts
  annotations?: ToolAnnotations;
  /** 由 AppShell / 路由注入的宿主能力（不许工具自己 import 路由） */
  execute: (input: unknown, ctx: { signal: AbortSignal }) => Promise<unknown>;
};
```

2. **审批策略**（集中在一处，不要散落在工具里）——照 fx 的模式与规则表思路：
   - 默认 `ask`；`annotations.readOnlyHint === true` 只作为**输入之一**，**不作为免审批的充分条件**（MCP 规范要求 annotations 视为不可信）。
   - `destructiveHint === true` 或「无 readOnlyHint」→ 强制 `user-approval`，并在 UI 上把「目标对象名称」用现有 `CopyableValue` 同款样式显示出来（对齐本仓 `DangerConfirmDialog` 的习惯）。
   - 三态审批按钮：**执行一次 / 本会话内此类操作不再询问 / 拒绝**（借鉴 fx 的三选一）。会话 grant 存内存，不落盘。
   - **审批链路异常一律 fail-closed**：拿不到用户决定就不执行，且明确提示原因。
   - 工具被拒后，system instruction 里加一句「不被批准的操作不要重试」。
3. **工具集（按页面动态注册）**。借鉴 WebMCP 的「动态注册 + 注销」：进详情页注册 `getCurrentEntityDetail`，离开就注销。具体到我们的能力清单：
   - 只读上下文：`getRouteContext`（当前 URL / appId / 路由参数 / 用户可见的筛选条件）—— **注意不要再造一份导航真值，读 `#/lib/navigation.ts` 与 `useRouterState`**；
   - 导航：`navigateTo({ navId })` —— 参数用**语义 key**（`navId`）而不是裸路径，工具内部查 `NAV_GROUPS` / `ALL_NAV_TARGETS` 解析（符合 WebMCP 的「用自然语言枚举值，别让模型算内部 id」）；
   - 统计查询：`queryStats({ entity, metric, range })` —— 复用生成的 `getXxxQueryOptions`，结果走**摘要 + 句柄**（对齐 fx 的 `read_tool_result`），**不要把整页表格塞进上下文**；
   - 填表单：`prefillForm({ formId, values })` —— 只写表单状态，**不提交**；
   - 写操作：`submitXxx` 带 `destructiveHint: true`，永远走 `toolApproval: 'user-approval'`。
4. **Thinking / Trace UI**：按 §3.3 的规格用 Kumo 令牌重写，动画包 `motion-safe:`，真实接入时由 `useChat` 的 part 状态驱动（`onInputDelta` 显示「正在生成参数」）。
5. **Approval Card UI**：按 §3.4 的骨架 + 本仓 `LayerDialog` / Kumo `Button` 变体实现（`destructive` 变体留给拒绝不可逆操作）。

### 6.3 直接放弃

- **fx.sh / libfx**：JSPI（Chrome 137+/Safari 27+）与 36 MB 产物两票否决。
- **WebMCP（`document.modelContext`）**：规范还是 CG Draft，只有 Chrome 149 / Edge 150 Origin Trial。**但工具字典形状照抄**（零成本，且将来能平滑切换）。
- **`@modelcontextprotocol/sdk` 系**：v1 已 legacy，v2 官方只声明 Node/Bun/Deno，包内无 `browser` 构建且带 `cross-spawn`。**我们不需要任何 MCP 传输层**。
- **Beautiful UI 作为依赖**：没有可安装形态（无 npm 包、无 registry 命令）→ 只能复刻。
- **自建「自动审查模型」**（fx 的 `auto` 模式）：要多发一次模型请求、更贵、且需要第二个可信模型；我们的场景（后台 SPA、操作可枚举、写操作可数）**用确定性的规则表 + 人工审批就够了**。

### 6.4 信息不确定 / 必须先验证的点（不要当成已确认）

| # | 不确定项 | 必须怎么验证 | 影响 |
|---|---|---|---|
| 1 | **OpenAI 与 Anthropic 的浏览器 CORS 真实行为** | 在**真实浏览器**里对 §2.4 的两条 `curl` 等价请求做预检实测（本机 `api.openai.com` 不可达、`api.anthropic.com` 被 403 拦在 CORS 之前） | 决定「浏览器直连」是否成立；不成立就必须走使用者自建薄代理 |
| 2 | **`ai@7` 安装时是否强制要求 zod 成为直接依赖** | `pnpm add ai` 后：① 看 `pnpm install` 是否报 peer 缺失；② 在**不显式 import zod**的前提下只用 `jsonSchema()` 跑 `pnpm typecheck` + `pnpm build` | 决定要不要显式加 `zod@4.6.5`（版本本身已在树里，**不是**版本冲突问题） |
| 3 | **~~`@ai-sdk/react` peer 与本仓 React 版本冲突~~（已排除）** | 已查 `pnpm-lock.yaml`：实际解析为 `react@19.3.0`，满足 peer `^19.2.1` | 无风险。仅 `package.json` 声明 `^19.2.0`，若将来 lockfile 被降到 19.2.0 才需注意 |
| 4 | **`@ai-sdk/mcp` 在 Vite 8 浏览器构建下是否可用**（依赖 `cross-spawn`、无 `browser` 字段） | 将来真要用时再 `pnpm build` 实测；报错就自己写工具类型 | 决定能否复用 MCP annotations 适配 |
| 5 | **各 provider 对 `strict: true` / JSON Schema 子集的支持差异** | 用真实 key 逐家试；OpenAI 官方文档明确「optional 属性不支持，需要 `.nullable()`」 | 影响 `inputSchema` 写法 |
| 6 | **Beautiful UI 的 `shimmer-text` / `fade-up` / `fade-in` / `spin` 四个 keyframes 的原始定义** | 站点把 `@keyframes` 放在自己的全局 CSS 里，源码文件内没有 → 我**确认了动画名、时长、缓动与延迟，但没有拿到 keyframe 的原始位移/透明度数值**，复刻时需按视觉自拟 | 影响 thinking 动效还原度（不影响功能） |
| 7 | **fx 是否提供 iframe 嵌入方式** | 已确认官方给的三种形态里没有 iframe（只有 npm `libfx` 的 Node / WASM 入口与 xterm 终端适配）；文档站亦未提 iframe | 不影响「不用它」的结论 |

---

## 附录：本报告涉及的全部版本号（采集于 2026-09-27，均为 npm registry / GitHub API 原文）

| 包 / 仓库 | 版本 | 许可 |
|---|---|---|
| `ai` | 7.0.116 | Apache-2.0 |
| `@ai-sdk/react` | 4.0.119 | Apache-2.0 |
| `@ai-sdk/openai` | 4.0.78 | Apache-2.0 |
| `@ai-sdk/anthropic` | 4.0.65 | Apache-2.0 |
| `@ai-sdk/openai-compatible` | 3.0.57 | Apache-2.0 |
| `@ai-sdk/mcp` | 2.0.60 | Apache-2.0 |
| `@ai-sdk/gateway` | 4.0.94 | Apache-2.0 |
| `@ai-sdk/provider` / `@ai-sdk/provider-utils` | 4.0.18 / 5.0.49 | Apache-2.0 |
| `openai` | 7.23.0 | Apache-2.0 |
| `@anthropic-ai/sdk` | 0.128.0 | MIT |
| `libfx` | 0.0.11 | Apache-2.0 |
| `vercel-labs/fx` | v0.0.11 | Apache-2.0，3158 ★ |
| `@modelcontextprotocol/sdk` | 1.30.1 | MIT |
| `@modelcontextprotocol/client` / `server` / `core` | 2.1.0 | MIT |
| `webmcp-types` | 0.1.9 | MIT |
| `zod`（本仓已有，kumo 的 peer） | 4.6.5 | MIT |
| 本仓 `react` / `react-dom`（lockfile 实际解析） | 19.3.0 | MIT |
| `webmachinelearning/webmcp` | Draft CG Report 2026-09-26 | NOASSERTION，4306 ★ |
| `grxtory/beautifului-mirror` | — | MIT，0 ★ |
| Beautiful UI（站点） | — | MIT，© 2026 Shane Levine |
