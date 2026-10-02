# AI 助手（Ask AI）接入设计

> 本文是「Ask AI 接入真实模型」这件事的**单一真值**：数据模型、工具协议、权限矩阵与后续扩展。
> 相关代码：`#/lib/ai/*`、`#/lib/ai/tools/select-tools`、`#/components/ai-panel`、`#/components/ai-composer`、`/settings/AI`。
> **注**：厂商 / 模型配置（原 `#/lib/store/ai-store`、`admin.ai`）已清理，见 §0 与 §2.1。
> 面板骨架与两种显示方式见 AGENTS.md §9；本文只讲「接上模型之后」的部分。

## 0. 状态与范围

**MVP（已落地）**

- 设置 → AI：**通用设置**（显示方式 / 输出语言 / 显示详细信息 / 跟随滚动 / 自动跳转 / 光晕 /
  头像 / 输出方式…）+ **AI 权限**；**厂商与模型配置已随 `admin.ai` 清理一并删除**（前端不选模型）；
- **请求经 `apps/ai`（Hono Worker）转发**，凭证由 Worker 注入，**浏览器不再持有 Key**；
  流式对话 + 工具调用循环（切换记录见 [ai-server-layer.md](./ai-server-layer.md) §5）；
- **上下文注入**：当前 URL / 路由模板 / appId / 面包屑 / 页面标题；
- **系统提示词分层 + 范围闸**：`packages/ai-prompt` 分层装配（身份 / **请求分诊与范围闸** / 能力 /
  工作方式 / 回答方式 / 页面上下文 / 任务清单），唯一出口 `buildSystemPrompt` / `buildTurnContext`
  （每轮重算、服务端拼接）。**按阶段加载**：Router 阶段只要分诊 + 工具目录，Execution 阶段才有
  操作规约与完整页面上下文。
  每轮**先分诊再行动**：业务外（闲聊、通识、数学、写代码与解释代码、翻译以外的语言任务、
  其它产品、专业建议…）一律拒绝且**不做任何工具调用**；例外只有**翻译**（系统是多语言的）
  与一句寒暄；分诊过程不输出给用户。分层理由、当前口径与扩展点见
  [ai-architecture.md](./ai-architecture.md) §8；
- **只读工具**：读页面上下文、列导航、检索接口清单、调用 GET 接口、读字典选项；
- **删除类动作（AI 可直接执行）**：先查清对象拿到 id，再走 `call_write_api`
  （`DELETE /user/{id}` 这类模板路径 + `pathParams`，批量删除走 `POST /xxx/batch-delete`）——
  **必过审批卡**（DELETE 标注「执行后无法撤销」），成功后刷新当前页面数据
  （`page-reload-bridge`，页面把自己的取数交给 AI，见 ai-architecture.md 坑 17/18）；
- **跳转要用户同意**（`navigate_to` 仍归 `read`）：**询问模式**下面板弹**三选一确认卡**
  （带我去 / 本会话自动跳转 / 先不跳）——「本会话自动跳转」写会话授权 `NAVIGATION_GRANT`
  （本会话免问）；**自动模式 = 始终允许，直接跳**；设置里的「自动跳转」让询问模式也免问。
  **全屏对话页落建议卡**（非阻塞，AI 不跳、把数据就地渲染，用户点卡片才去页面）。
  细节见 §3.2 与 [ai-architecture.md](./ai-architecture.md) §8.1；
- `ask`（只读）/ `auto`（多出「页面操作」）两模式的**权限分级**；
- **写操作 + 人工审批**：`call_write_api`（`access: 'commit'`）在执行前弹审批卡，
  用户点「允许一次 / 本会话不再询问 / 拒绝」才决定是否发请求；审批链路异常一律 fail-closed；
- **助手回复渲染 Markdown**（`#/components/markdown-content` → 懒加载的 `markdown-renderer`）：
  标题 / 列表 / 表格 / 代码块 / 链接。三条约定：把 AI 输出当**不可信内容**（`react-markdown`
  默认不渲染 raw HTML、链接一律 `target="_blank"` + `noopener`、图片 `referrerPolicy="no-referrer"`）；
  **流式期间退回纯文本**（省掉每个 token 解析一遍，也避免未闭合语法让渲染来回跳）；
  **必须懒加载**（这个渲染器 gzip 46 kB，静态引入会进主 bundle —— 实测主 bundle 只多了 0.09 kB）。

- **AI 进行中的页面级反馈**：视口四周向内发光的呼吸光晕（`#/components/ai-activity-glow`）。
  运行态与设置页那张预览（`AiActivityGlowPreview`）**都用 `border-beam` 的 Pulse 家族
  `pulse-inner` 档**。运行态要按尺寸补两处：`glowSize={4}` + `--pulse-glow-boost: 4`
  （包的渐变斑块尺寸是按卡片写死的，满视口下不放大就退化成几个孤立的彩点）+
  `glowTuning()` 提亮深色档（同样的 alpha 压近黑底只剩 1/5 的亮度）。详见架构文档。
  三个坑：`theme` 必须传 `useColorMode().resolved`（包的 `auto` 读不到本项目的 `data-mode`）；
  运行态**定位/层级/boost 要写内联 `style`**（包生成的 CSS 把根写成 `position: relative`，
  用类名会被压掉），且 `pointerEvents: 'none'` 不能漏（包的光层自带，根节点没有）；
  **不要改成包住 `AppShell`**：包裹等于给 `Sidebar.Provider` 再套一层容器（sidebar 的 sticky、
  AI 面板的 fixed、详情分屏的 grid 都可能受影响），而且外壳高度随内容增长，光晕会跟着内容滚出视口。
  这个包会进主 bundle（gzip 14 KB）。
  用户可在 **设置 → AI** 里关掉它（`aiActivityGlow`，落在 `admin.preferences:<appId>`、默认开）。

- **详细信息默认隐藏**（`aiShowDetails`，默认 `false`，设置 → AI 可打开）：它同时管工具调用卡片
  与助手消息下方那行 token 用量（「缓存命中 X · 输入 Y · 输出 Z」）。普通用户只关心回答内容，
  不关心中间调了哪个接口、更不关心 token 账。关掉时 `AssistantPart` 对工具类 part 直接
  `return null`，用量行同样不渲染。
  **三件事刻意不受它影响**：**审批卡**（写操作的确认是必须的交互，在 `AiConversation` 里独立渲染，
  不是可以隐藏的"输出"）、**任务规划卡（manage_tasks）**与**「正在思考…」**（工具执行期间
  `status` 仍是 `streaming`，所以看不到工具卡片也不会显得卡死）。

- **助手头像**（`bot-avatars`，设置 → AI 选形状、默认 `clover`）：助手消息左侧一枚
  （正在生成的那条 `state="working"`、其余 `default`）与「正在思考…」那一行。三条约定：
  **`theme` 由我们传**（包的 `auto` 读 `data-theme`/class，本项目是 `data-mode`，会读错）、
  默认 `interactive={false}`、设置页的网格里**只有选中的头像在动**（18 个 canvas 同时跑
  动画是白烧 CPU）。形状值列表在 `#/lib/store` 自己维护，拼写由使用处的类型检查保证。
  体积 51.6 kB（gzip 22 kB），被 AppShell 与设置页共享。

- **输出方式**（`aiOutputMode`，默认 `wait`）：`wait` 下正在生成的那条消息整条不渲染
  （数据照常累积、结束时一次性出现），`stream` 才边生成边显示。同时修掉了「正在思考…」
  与流式正文并排显示的 bug —— 它的条件从 `status === 'streaming'` 改成「这一轮还没有
  **可见**输出」。

- **滚动**（`aiAutoScroll`，默认开）：回答时自动贴底；手动往上翻会**临时暂停**（滚回底部恢复）
  —— 设置项管「默认跟不跟」，暂停是运行时状态、管「此刻让不让」。没贴底时滚动区下缘**居中**
  浮出「回到底部」按钮（贴底时不出现）；按钮层 `pointer-events-none`，否则会拦住消息里的链接。

- **新对话的空态**：放大的头像（96px，与会话里同一个形状）+ 按时段变的问候
  （`greetings.*` + `greetingPrompt`）。时段按**用户选的时区**判断（不是本机时区，
  与后台其它「现在几点」保持一致），`Intl` 用 `hourCycle: 'h23'` 避开午夜返回 `"24"`。

- **表单桥** `useAiFormBridge`：业务表单注册字段与提交函数，AI 才能「填表」（本期按约定不做）；
- 工具结果的可视化卡片（表格 / 图表）、thinking 态的细分动效
  （规格见 [ai-stack-research.md](./ai-stack-research.md) §3.3，来源是 Beautiful UI 的 `ThinkingState`）。

> **（历史记录：厂商直连的浏览器 CORS）** 该前提已随 `apps/ai` 中间层落地而消失 —— 请求不再从
> 浏览器直连厂商，不存在 CORS 问题。以下保留当时的调研结论：调研时本机无法实测 —— `api.openai.com` 不可达、
> `api.anthropic.com` 的 403 出自风控层（早于 CORS 处理）。使用者已在真实环境里跑通了整条链路，
> 但没有回传 CORS 这一项是否通过；若不通过，兜底是自建一层薄代理（只补 CORS 头、不落 Key），
> 请求层已做成可替换的 adapter，改一处即可。

## 1. 分层架构

```
┌─ L5 UI ────────── ai-panel（消息流 / 工具调用卡 / 审批卡）
│                   ai-composer（输入区 + 显示方式 + 模式切换）
├─ L4 工具层 ────── #/lib/ai/tools/*：注册表 + JSON Schema + access + execute
│                   Router 的虚拟工具 select-tools（不进 AI_TOOLS）
│                   ctx = { navigate, queryClient, client, getPageContext, requestApproval }
├─ L3 上下文层 ──── #/lib/ai/page-context：当前 URL / 路由 / appId / 面包屑 / 页面标题
│                   packages/ai-prompt：系统提示词分层，按 promptStage（router / execution）
│                     选层（Router 只给分诊 + 工具目录，Execution 才有操作规约与完整页面上下文）；
│                     唯一出口 buildSystemPrompt / buildTurnContext
├─ L2 运行时层 ──── #/lib/ai/runtime：一次 streamText 内的两阶段（prepareStep + activeTools）
│                   —— 第 0 步只发 select_tools，resolveTools 解析后第 1 步起只发选中的业务工具；
│                   无额外模型往返。另含 provider adapter
└─ L1 配置层 ────── 本机偏好（`admin.preferences:<appId>`：权限 / 模式 / 显示相关）
                    原 `admin.ai`（providers[] / models[] / activeModelId）已删除 ——
                    模型与凭证由 `apps/ai` / AI Gateway 决定，前端不选模型、不声明能力
```

每层只依赖它下面的层：工具不认识 OpenAI，运行时不认识 Kumo，UI 不认识 JSON Schema。

## 2. 数据模型

### 2.1 厂商与模型（L1，已删除）

原 `admin.ai`（全局一份、不按应用隔离）里的 `providers: AiProviderConfig[]` + `models: AiModelConfig[]`
+ `activeModelId`，以及模型「能力声明」（`supportsTools` / `reasoningLevels` / `reasoning` /
`supportsVision`）**均已删除**：

- `#/lib/store/ai-store.ts` 移除，`#/lib/store/index.ts` 不再导出；`admin.ai` 键不再被写入或读取
  （旧存档残留没有任何读取方）。
- 设置页只剩「通用设置」与「AI 权限」两张卡片；`ai-provider-card` / `ai-model-card` /
  两个导入导出弹窗一并删除。
- 输入区行尾设置按钮只剩「配置权限」一项（且只有面板给，全屏对话页没有）；图片 / 文件入口
  **始终可用**，不再按模型能力置灰。
- 模型与凭证改由 `apps/ai`（Hono Worker，**`AI_MODEL_ID` 覆盖客户端的 model**）与 AI Gateway
  决定；`runtime.ts` 的 `WORKER_MODEL_ID = 'nivo-ai-server-fixed'` 只是占位。
- 工具是否随请求发出**只由权限决定**（`chat.ts` 的 `getAllowedTools`）；`runtime.ts` 已删
  `resolveReasoning()` 与 `StreamAssistantTurnOptions.supportsTools`。
- `@ai-sdk/anthropic` / `@ai-sdk/openai` 依赖**仍在 `apps/web/package.json`，仍待移除**
  （已不再被 import）。

### 2.2 会话与消息（L2）

```ts
type AiMessagePart =
  | { type: 'text'; text: string }
  | { type: 'attachment'; kind: 'image'; url: string; mediaType: string; name?: string; size: number }
  | { type: 'attachment'; kind: 'text'; name: string; size: number; text: string }  // md / txt，客户端已解析
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown; state: 'running' | 'done' | 'error'; output?: unknown; error?: string }

interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  parts: AiMessagePart[]
}

interface AiSessionSummary {
  id: string
  appId: string
  title: string
  createdAt: number
  updatedAt: number
}
```

**会话持久化在 IndexedDB**（`#/lib/ai/session-db`，库名 `admin.ai`）、**按 app 分区**。
三个 store 的分工 —— **元数据与消息分开存是关键**：

| store | 内容 | 为什么分开 |
|---|---|---|
| `sessions` | 元数据（标题 / 时间戳 / appId） | 列表要按时间排序展示；消息若塞在一起，每次开面板都要把全部正文反序列化一遍 |
| `messages` | `{ sessionId, messages }` | 只有真正打开某个会话时才读 |
| `meta` | 每个 app 的 `activeSessionId` | 记住上次打开的是哪个会话 |

**为什么不用 localStorage**：一条会话带着工具调用的原始结果，几十上百 KB 很常见，
而 localStorage 有 5 MB 上限、且是**同步** API（流式期间每次落盘都卡主线程）。

**写盘只有三处时机**（都由 `chat.ts` 触发）：用户发送后**立刻**写（助手回复中途刷新，问题不丢）、
一轮结束 / 失败 / 中止后写、以及切换与删除会话时由 store 自己处理。
**流式期间每个 token 不写** —— IDB 虽然异步，但为一轮回复开几十上百次事务没有意义，
刷新丢的也只是半句话。

**读盘只在「首次进入」与「切 app」**（`loadHistory` 对同一个 app 会早退）：
面板关闭时 `AiPanel` 整体卸载、再打开是一次重挂载，没有这道判断就会用 IDB 里的旧版本
**覆盖掉流式回复已经吐出来的增量**。

**标题取第一条用户消息**（`deriveSessionTitle`：压平空白 + 截断 40 字），不额外调模型；
「点了新对话但没说话」**不建记录**，避免列表里堆一串空会话。

## 3. 工具协议（自研 MCP-like）

WebMCP 目前只在很新的 Chrome 里可用（且规范仍在演进），本项目要覆盖旧浏览器，因此**不复用它**；我们只借用 MCP 的**数据模型**（工具 = 名字 + 描述 + JSON Schema 输入），传输层不做（工具就是同一个页面里的函数，不需要跨进程协议）。

### 3.1 工具定义

```ts
interface AiToolDefinition<Input = unknown> {
  name: string                 // 给模型的唯一名字，蛇形
  catalogDescription: string   // Router 阶段的一句话（10~25 个中文字）—— 只说明"能干什么"
  description: string          // Execution 阶段给模型看的用途说明（已精简：做什么 / 输入约束 / 前置条件 / 安全约束）
  dependencies?: readonly string[]   // 前置工具，Runtime 自动补齐（analyze_data → ['get_page_data'] 等）
  catalog?: boolean            // 默认 true；false = 不进 Router 目录（仍可被依赖补齐）
  execution?: boolean          // 默认 true；false = 即使被选中也不进执行阶段
  inputSchema: Record<string, unknown>   // JSON Schema，直接用，不引入 zod
  access: 'read' | 'act' | 'commit'
  group: 'page' | 'data' | 'form'   // 权限界面里的分组（工具自己声明）
  execute: (input: Input, ctx: AiToolContext) => Promise<unknown>
}
```

**不引入 zod**：AI SDK v5 的 `tool()` 接受 JSON Schema（`jsonSchema()`），而我们的工具输入本来就该是纯数据描述 —— 少一个依赖，也方便将来把 schema 直接展示给用户。

**双层描述与按需加载**：`catalogDescription`（一句话）只随 Router 阶段的工具目录发给模型；
`description` + `inputSchema` 只在 Execution 阶段随选中的工具下发。工具之间的比较、容器策略、
`@` 引用编排一律不在工具描述里（由提示词层承载）—— 描述里保留的是不猜路径 / 不猜字段 /
写操作确认 / 删除不可撤销 / 被拒不重试 / `truncated` 不下结论 / 探测值必须来自用户这些约束。
Router 的输出**不被信任**：`resolveTools` 会做 名字存在性 → 权限 / 容器 / 表单 / 后端权限点 →
依赖闭包 → `execution:false` 过滤（见 [ai-architecture.md](./ai-architecture.md) §2）。

### 3.2 权限（能用到什么）与模式（要不要问）

这两个维度**正交**，别再揉在一起：

| 维度 | 取值 | 回答的问题 | 落点 |
|---|---|---|---|
| **权限** `aiPermission` | `full` / `readonly` / `custom` | **能不能用**这个工具 | `getAllowedTools(permission, customTools)` |
| **模式** `aiComposerMode` | `ask` / `auto` | 用起来**要不要问** | 各工具的 `execute` 读 `ctx.mode` |

**权限**默认 `readonly`（AI 默认只能看，要它动数据得用户自己去开）；`custom` 档按
`aiAllowedTools` 里勾选的工具名放行。**模式**下只有与"替用户做主"有关的动作才过审批：

| 工具 | ask | auto |
|---|---|---|
| `read` 类 | ✅ 直接 | ✅ 直接 |
| `navigate_to` | ⚠️ 先确认（面板三选一确认卡） | ✅ 直接跳（**自动 = 始终允许**） |
| `fill_form` | ⚠️ 先请用户确认 | ✅ 直接写 |
| `submit_form` | ⚠️ 一律确认 | ✅ 表单 `canSubmit()` 通过就直接提交 |
| `call_write_api` | ⚠️ 确认 | ⚠️ **仍然确认** |

`call_write_api` 是唯一"两个模式都要确认"的：通用写接口**没有可预览的表单**，
自动执行等于让模型直接改库；而 `submit_form` 有表单兜底 —— `canSubmit()`
（校验通过 + 确实有改动）就是「信息足够」最可靠的可判定表达，比让模型自述可信得多。

**跳转（`navigate_to`）是一条独立于写操作的规则**：它归 `read` 档 —— 只读档也必须有它，
否则只读的 AI 连「带我去表格示例」都做不到 —— 但它会把用户**带离当前页面**，
所以**询问模式下**要用户点头（**自动模式 = 始终允许，直接跳**）：

| 容器 | 形态 |
|---|---|
| 面板 · 询问模式 | **确认卡**（页面名 + 路径 + 理由），**三选一**：「带我去」（只这一次，不写授权）/「本会话自动跳转」（写会话授权 `NAVIGATION_GRANT`，本会话内不再问，刷新失效）/「先不跳」（拒绝）。设置里的「自动跳转」（`aiAutoNavigate`）让询问模式也免问 |
| 面板 · 自动模式 | 不问，直接跳 |
| 全屏 | **建议卡**（`nav-proposal` part，非阻塞，与模式无关）：不真跳，AI 继续把数据渲染在对话里，用户点卡片才跳。全屏不写会话授权 |

被拒绝时工具**抛错**，错误文案明确要求模型"不要重试同一目标"（改就地渲染 / 换目标 / 反问）。
两处容器差异各只有一个落点：提示词的工作方式层（`prompt/workflow.ts` 读 `surface`）
与工具清单（`getAllowedTools(..., { surface })`，全屏不发 `update_search_params`）。
细节见 [ai-architecture.md](./ai-architecture.md) §8.1。

`access` 现在**只描述风险等级**（权限界面按它解释、`readonly` 档按它过滤），
**不再决定可用性** —— 早先 `getToolsForMode` 那版里它确实兼任了权限，
结果 `ask` 成了一个连表都填不了的模式。

### 3.3 MVP 工具清单

| 工具 | access | 说明 |
|---|---|---|
| `get_page_context` | read | 当前 URL / 路由模板 / appId / 面包屑 / 页面标题 —— AI 问「我在哪」时用 |
| `list_navigation` | read | 全部导航项（业务 + 外壳），带名称与路径，供 AI 选目标 |
| `search_api` | read | 在 `GET /api` 的 632 条接口清单里按关键词检索 |
| `call_read_api` | read | 调用**清单内**的一个 GET 接口，带 query，返回 JSON（截断） |
| `list_dict_options` | read | 读字典选项（`1/2` → 「启用/禁用」），避免 AI 瞎猜枚举含义 |
| `get_page_data` | read | 读**当前页面已加载的数据**（`feature.ts` 的 `dataSources`）与可用指令清单 —— 面板模式不必再调接口（全屏容器里不下发） |
| `run_page_command` | **commit** | 执行页面声明的指令（`feature.ts` 的 `commands`），**复用页面自己的处理函数**（含 toast / 刷新）；write 类必过审批卡 |
| `call_write_api` | **commit** | 调用清单内的写接口（POST/PUT/PATCH/DELETE）；**执行前弹审批卡**（DELETE 标注不可撤销），被拒则抛错、不发请求；路径模板的 `{id}` 用 `pathParams` 填；成功后刷新页面数据 |
| `navigate_to` | read | 导航到某个路径（归 `read`：它不改变任何东西，只读档也允许）。**默认要用户确认**：面板确认卡（同意后本会话免确认）/ 全屏建议卡 —— 见 §3.2 |

`call_read_api` 的两条硬约束（这是「利用现实已有东西」的关键）：

1. **白名单**：只允许调用 `GET /api` 清单里存在的接口 —— 清单既是 AI 的检索源，也是安全边界，AI 无法构造任意路径去打后端；
2. **只读**：method 只能是 `GET`；写操作走 `call_write_api`（同样受白名单约束）并**强制审批**。

`call_write_api` 的额外约束：

1. **method 必须与清单完全一致**：`DELETE /api/user` 不能靠伪造 method 绕过（清单里没有这条就拒绝）；
2. **路径参数按模板填**：清单里的路径是 `DELETE /user/{id}` 这种模板，模型可以传模板 +
   `pathParams`（`{ id: 10001 }`），也可以直接给替换好的真实路径 —— 白名单校验的对象始终是
   **替换完成后的真实路径**（模板匹配只放宽"比较方式"，不放宽边界）；占位符没填满**直接报错**，
   绝不把 `{id}` 原样发出去；
3. **审批是执行前置**：`await ctx.requestApproval({ toolName, input, reason })`，UI 展示 method / path / pathParams / body 原文，用户三选一；DELETE 额外标注「执行后无法撤销」；
4. **拒绝即抛错**：错误文案里带「不要重试同一个请求」，让模型如实向用户说明，而不是假装成功；
5. **成功后刷新页面数据**：优先走页面登记的 `page-reload-bridge`（`useAiPageReload`，
   保留筛选/分页/排序），页面没登记时退回 `queryClient.invalidateQueries()` ——
   列表页可能把数据放在 React state 里（表格示例页就是），不刷新就会出现「AI 说删了、
   界面上还在」。

另外返回值要**截断**（列表接口动辄几百条），并在截断时明确告知模型「还有更多数据」，让它改用分页参数而不是把整个响应塞进上下文。

### 3.4 上下文注入

`PageContext` 每轮对话**重新采集**（用户可能已经导航了）：

```ts
interface AiPageContext {
  appId: string | null
  appName: string | null
  url: string            // 完整 URL（含 search / hash）—— 用户强调过这是最关键的资源
  pathname: string
  routeId: string | null // TanStack Router 的路由模板，如 /$appId/example/user/$uid
  breadcrumb: string[]   // 首页 / 示例 / 表格示例
  title: string | null   // 页面标题
}
```

注入方式：拼成一段 system 提示词（而不是让 AI 每轮先调一次工具）—— 「我在哪」是**每轮都要用**的信息，让它多花一次工具调用去取是浪费；`get_page_context` 工具保留给「AI 想确认导航之后的位置」的场景。

**URL 为什么必须给**：管理后台的路由本身就编码了「用户正在看什么」——`/$appId/system/features/483` 同时表达了应用、模块、以及当前实体 id。没有它，AI 只能靠猜或者反问，而它猜错的时候用户已经不在那个页面上了。

### 3.5 表单桥：让 AI 填表（而不是操作 DOM）

`#/lib/ai/form-bridge` 是一张**模块级注册表**：当前页面上正在编辑的表单把自己登记进来，
AI 通过三个工具操作它（`list_page_forms` / `fill_form` / `submit_form`）。

**为什么不 DOM 驱动**（像 browser-use 那样直接找 input 填值）：本仓库的表单全是**受控组件**，
直接改 `input.value` 不会触发 React 的 onChange（值丢失，或被下次渲染覆盖），得靠
native setter + 派发事件的技巧，动态字段、RTL、校验都会跟着出问题。注册表把
「AI 能改什么」变成**业务代码自己的声明**：类型安全、可审计。

**注册拆成两半**，因为这两件事天然属于不同的组件：

| 半边 | 谁注册 | 钩子 | 提供 |
|---|---|---|---|
| 字段读写 | 表单组件（state 在它手上） | `useAiFormFields` | `fields` / `getValues` / `setValues` |
| 提交 | 页面组件（它知道怎么保存） | `useAiFormSubmit` | `submit` / `canSubmit` |

两半靠**同一个 id** 拼成一条记录；缺哪半，对应工具就明确拒绝。参考实现：features 功能详情
（`feature-form.tsx` + `feature-detail.tsx`，id = `feature-detail`）。

四条硬约定：

1. **`fill_form` 只放行表单声明过的字段** —— 模型编出来的键进不了业务 state
   （会出现在返回值的 `ignored` 里）；
2. **字段集随 `variant` 收敛**（功能组没有「权限标识」、权限点没有「显示」）——
   否则 AI 会看到界面上根本不存在的字段；
3. **同步 effect 故意不写依赖数组**：写依赖会让注册退化成「首次渲染的快照」
   （切语言后字段名还是旧语言的）。upsert 只改模块级 Map、不触发渲染，因此每次渲染同步是安全的；
4. **`submit_form` 先问 `canSubmit` 再走审批** —— 表单没变脏 / 校验不过时直接拒绝，
   别弹一张让用户白点一次的审批卡。

## 4. 安全与风险

- **API Key 已不再落浏览器**（原设计明文存在 `admin.ai`，见 §2.1 的历史说明）：随厂商配置删除后，
  凭证只存在于 `apps/ai` 的 secret 与 AI Gateway 的 BYOK，**任何日志 / toast / 错误都不回显**。
  共用电脑 / 生产环境不再有「本机存了真实 Key」这个风险面。
- **请求经 `apps/ai`（Hono Worker）转发**：浏览器不再直连厂商，CORS 与
  `anthropic-dangerous-direct-browser-access` 不再是前提；请求层仍是**可替换 adapter**。
- **工具白名单**是唯一防线之外的第二层：即使模型被提示词注入诱导，它能打的也只有 `GET /api` 清单里的 GET 接口。
- 会话与工具结果**存在本机**（IndexedDB），除经 `apps/ai` 转发给模型外不额外上报。

## 5. 复用清单（不要重新发明）

| 已有资产 | 在 AI 里的用途 |
|---|---|
| `#/lib/navigation` 的 `NAV_GROUPS` / `ALL_NAV_TARGETS` / `ALL_SHELL_NAV_TARGETS` | `list_navigation` 的数据源 |
| `GET /api` 接口清单（`getApiQueryOptions`） | `search_api` / `call_read_api` 的索引与白名单 |
| `client`（`#/api`，已注入 Bearer 与 `X-App-Id`） | 工具发请求直接复用，不另建实例 |
| `getQueryClient(scope).fetchQuery(...)` | 命令式取数（工具不是 React 组件） |
| `#/lib/dict-options` | `list_dict_options` |
| `#/lib/store/shell-ui-store` | 全局 store + persist + 跨标签同步的写法模板 |
| `#/components/settings-card` | 设置页两张新卡片的行布局 |
| `ai-composerMode`（ask / auto） | 权限分级已经在 store 里了 |
