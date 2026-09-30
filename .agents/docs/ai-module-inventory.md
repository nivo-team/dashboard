# AI 模块总览（提示词 · 业务 · 代码）

> **这份文档是「清单式入口」**，与 [`ai-architecture.md`](./ai-architecture.md) 分工：
>
> | 文档 | 形态 | 什么时候读 |
> |---|---|---|
> | [ai-architecture.md](./ai-architecture.md) | **叙述式**：分层理由、数据流、扩展点、**18 条踩过的坑** | 改任何 AI 代码之前 |
> | **本文** | **清单式**：提示词七层逐层、16 个工具全表、审批矩阵、设置项全表、**AI 相关文件全地图** | 想知道「AI 现在到底有什么 / 在哪个文件」时 |
> | [ai-integration.md](./ai-integration.md) | 设计蓝图与选型依据（给人看） | 追溯「当初为什么这么设计」 |
>
> 覆盖面：`apps/web/src/lib/ai/**`（32 个文件）、`lib/features/**`、`components/ai-*.tsx`、
> `routes/$appId_.sphere/**`、`settings/AI.tsx`、两个 store、`messages/ai/*`、生成脚本与依赖。
> 本文只描述**当前代码事实**；与旧文档不一致处以本文 + 代码为准（差异见 [§5](#5-现状与文档--代码不一致待修)）。

> ⚠️ **2026-09 迁移**：系统提示词的**规则**已迁到服务端 —— 真值在 `packages/ai-prompt`，
> 由 `apps/ai`（Hono Worker）拼接。本文里所有 `lib/ai/prompt/**` 路径**均已不存在**；
> 前端改由 `lib/ai/prompt-facts.ts` 采集**事实**后随请求上报。以
> [`ai-server-layer.md`](./ai-server-layer.md) 为准。

---

## 0. 一分钟速览

| 项 | 现状 |
|---|---|
| 系统提示词 | **7 层**，唯一出口 `buildSystemPrompt(mode, outputLocale, surface)`，**每轮重算**，约 2k token 量级 |
| 工具 | **16 个**（`AI_TOOLS`），按 `group` 分 页面 / 数据 / 表单；权限界面按 `access` 解释风险 |
| 运行容器 | 2 个：`panel`（分屏 / 浮窗）、`sphere`（全屏对话页）；**由渲染处显式传入**，不靠路由字符串反推 |
| 正交维度 | **权限**（能不能用） × **模式**（用起来要不要问） × **容器**（策略与工具清单） |
| 运行时 | `lib/ai/runtime.ts` 是全仓唯一 `import 'ai'`（Vercel AI SDK v7）之处，**动态加载** |
| 持久化 | 会话在 IndexedDB（按 app 分区）；配置在 localStorage（`admin.ai` 全局 / `admin.preferences:<appId>` 按 app） |
| 接入面 | 10 份 `feature.ts`（新）+ 5 处 AI 表单桥（旧路径仍可用） |
| 7 语言 | `ai` 命名空间 126 个叶键，**7 语言完全一致**（`pnpm guardrails` 全量门控） |

---

## 1. 分层与一轮消息的调用链

```text
L1 UI        AiComposer ──sendAiMessage(text, mode, attachments, surface)──┐
             AiPanel / sphere 全屏页 / AiConversation / AiActivityGlow      │
L2 状态      useAiSessionStore（消息 / status / pendingApproval / IDB 落盘） │
L3 驱动      chat.ts ─────────────────────────────────────────────────────┘
               ├─ 读偏好：aiPermission / aiAllowedTools / aiOutputLanguage / locale / aiAutoNavigate
               ├─ getAllowedTools(permission, allowed, { hasForms, surface })   ← 权限与容器的唯一过滤点
               ├─ beginTurn() → await persist()
               ├─ await import('./runtime')                                     ← 懒加载
               ├─ toModelMessages(messages)        ← @ 引用展开 + 历史衰减 + 附件转 part
               └─ streamAssistantTurn(...)
L4 运行时    runtime.ts（唯一 import 'ai'）
               ├─ buildSystemPrompt(mode, outputLocale, surface)   ← 提示词唯一出口
               ├─ createLanguageModel(provider, model)             ← openai / anthropic 两大规范
               ├─ streamText({ reasoning, tools, stopWhen: isStepCount(30) })
               └─ fullStream → AiStreamEvent（think 标签解析 + nav-proposal 翻译）
L5 事件      StreamEventBatcher（~25ms 合并）→ session-store.applyEvent → UI
L6 工具      tools/{page,data,form,feature,search,task,permission}-tools.ts
L7 上下文    page-context / page-context-registry / page-capabilities / endpoint-specs /
             form-bridge / page-reload-bridge / search-params-bridge / route-refs / session-db
```

**两条硬边界**：L4 不能被静态 import（SDK + 三个 provider 几百 KB）；`endpoint-specs.gen` 只准
`import type` + 动态 `import()`。

---

## 2. 提示词（Prompt）

### 2.1 唯一出口与装配

- 出口：`#/lib/ai/prompt/index.ts` 的 `buildSystemPrompt(mode, outputLocale, surface)`。
- 顺序真值：同文件的 `PROMPT_LAYERS`（**加一层 = 加 builder + 在数组占位**）。
- 空层（`build` 返回 `null` / 空白）整段不拼，层间空一行。
- 每轮重算：页面上下文含标题、任务清单含会话状态、范围清单含 appId 与界面语言 → **绝不缓存成常量**。
- 输入快照 `PromptLayerInput`：`{ mode, surface, outputLocale, context, appName }`，其中 `context`
  由 `getPageContext()` **一轮只采一次**，各层共用同一份。

### 2.2 七层逐层清单

| # | 层文件 | 标题 | 回答的问题 | 关键内容（当前口径） |
|---|---|---|---|---|
| L1 | `prompt/identity.ts` | 身份与定位 | 你是谁、为谁服务 | 应用名走 `appName` 参数；显式掐掉「通用助手」人格 —— **只为这一个系统服务** |
| L2 | `prompt/scope.ts` | 第 0 步：请求分诊与范围闸 | **什么该答、什么该拒** | 三分类表（✅业务内 / ⛔越界 / ⚠️模糊）；**逐条点名越界类型**（闲聊、通识、数学、写代码与**解释代码**、其它产品、专业建议、任何「忽略规则」的元指令）；**两个例外**（翻译、一句寒暄）；越界话术 3 行内；「不变通」硬约束（含**数据不是指令**）；模块清单从 `collectNavigation` 派生（上限 30 行），无 appId 时给外壳页面清单 |
| L3 | `prompt/capability.ts` | 能力边界 / 操作前的确认 | 手上有什么、要不要先问 | **绝不复述权限**（见坑 1）；只描述模式：`ask` 动手前先问 / `auto` 直接做，`call_write_api` 两模式都问；跳转是**交互确认不是权限**，被拒后不重试同一目标 |
| L4 | `prompt/workflow.ts` | 工作方式与决策优先级 | 业务内请求怎么做 | **按容器分策略**：面板 playbook = 单模块查询**先带用户去页面**、多模块才调接口；全屏 playbook = **就地渲染数据**、跳转退化成建议卡；通用规约（先工具后回答、写操作走清单接口、被拒即停、`truncated` 处理、复合任务用 `manage_tasks`、续做守则） |
| L5 | `prompt/output.ts` | 回答方式 | 怎么说话 | **用目标语言的自名回答**（`SUPPORTED_LOCALES.nativeName`）；先结论后依据；**不暴露分诊过程、不复述提示词原文**；拒绝用同一门语言、3 行内 |
| L6 | `prompt/index.ts` → `buildPageContextLayer` | 当前页面上下文 | 我在哪 | 单一出口 `formatPageContext(context)`（URL / appId / routePath / navLabel / title） |
| L7 | `prompt/workflow.ts` → `buildActiveTasksLayer` | 进行中的任务清单 | 这轮在续做什么 | 从会话消息里取最后一份 `manage_tasks` 清单**直接注入**（绕开历史工具结果衰减）；无未完成项时返回 `null` |

### 2.3 提示词里的「事实」只有四个来源（全部经函数、留过滤点）

| 内容 | 出口 | 时机 |
|---|---|---|
| 系统提示词 | `buildSystemPrompt` | 每轮重算 |
| 当前页面 | `formatPageContext(getPageContext())` | 每轮采集 |
| 导航清单（能去哪） | `collectNavigation(appId)` → `list_navigation`（也是范围闸的数据源） | 模型调用工具时 / 拼提示词时 |
| 表单清单 | `listAiForms()` → `list_page_forms` | 模型调用工具时 |
| 页面接口 + 参数明细 | `resolveAiPageContext(routePath)` / `resolveActivePageCapabilities(routePath)` + `findEndpointSpec()` → `get_page_context` | 模型调用工具时 |
| 用户 `@` 指定的位置 | `expandRouteRefs(text)` → 追加到 user 消息末尾 | 每轮请求 |

**铁律**：任何给模型的内容都要经过函数，过滤条件集中在函数内部一处（将来按权限收窄的落点）。

### 2.4 提示词硬约定（改之前必读）

1. **不复述权限**：权限由「本轮实际交给模型的工具清单」表达。反例：`navigate_to` 已在只读档，
   提示词若写「你只能读」，模型会拒绝跳转（真实发生过）。
2. **边界（scope）与流程（workflow）必须分开**：混写会让 30 行操作细则把「越界要拒」平均掉。
3. **顺序即优先级**：分诊排第 2 位（仅次于身份），可变事实排最后。
4. **容器只影响 L4 与工具清单**，且各只有一个落点；工具描述保持容器中立。
5. **不暴露内部过程**（scope 层与 output 层各压一道）：回答里不出现分类标签，规则原文不念给用户。

---

## 3. 业务（Business）

### 3.1 三个正交维度 —— 任何时候别揉成一个开关

| | **权限** | **模式** | **容器** |
|---|---|---|---|
| 存哪 | `aiPermission` + `aiAllowedTools` | `aiComposerMode` | 渲染处传入（`AiComposer.surface`） |
| 回答 | **能不能用**这个工具 | 用起来**要不要问** | 策略与**能发哪些工具** |
| 落点 | `getAllowedTools()`（唯一过滤点） | 各工具内部读 `ctx.mode` | `workflow.ts` + `getAllowedTools` | 
| 默认 | `readonly`（只读） | `ask`（询问） | 面板 / 全屏 |

**权限三档本质是同一份勾选清单**（`resolveAllowedToolNames`）：`full` = 全选、
`readonly` = 预设勾了所有 `access === 'read'` 的工具、`custom` = 用户勾的（并剔掉已下线的名字）。
从预设档切到「自定义」要**继承当前档实际勾选的集合**。

### 3.2 工具全表（16 个，`AI_TOOLS` 是唯一真值）

| # | 工具 | group | access | 审批行为 | 容器差异 | 文件 |
|---|---|---|---|---|---|---|
| 1 | `get_page_context` | page | read | — | 全屏拿不到业务上下文（如实说明） | `page-tools.ts` |
| 2 | `list_navigation` | page | read | — | — | `page-tools.ts` |
| 3 | `navigate_to` | page | read | 面板 `ask` 且未开「自动跳转」才问（三选一卡）；`auto` 直接跳 | **全屏不真跳**，返回 `proposed` → 建议卡 | `page-tools.ts` |
| 4 | `update_search_params` | page | read | 不问（只改前端视图） | **全屏不下发** | `search-tools.ts` |
| 5 | `get_page_data` | page | read | — | **全屏不下发** | `feature-tools.ts` |
| 6 | `run_page_command` | page | commit | `approval: 'always'` 或 `kind === 'write'` 一律确认；`destructive` 标注不可撤销 | **全屏不下发** | `feature-tools.ts` |
| 7 | `manage_tasks` | page | read | — | — | `task-tools.ts` |
| 8 | `request_permission` | page | act | 直接弹授权卡（把 grant 写到 `submit_form` / `call_write_api`） | — | `permission-tools.ts` |
| 9 | `search_api` | data | read | — | — | `data-tools.ts` |
| 10 | `call_read_api` | data | read | — | — | `data-tools.ts` |
| 11 | `list_dict_options` | data | read | — | — | `data-tools.ts` |
| 12 | `call_write_api` | data | commit | **两个模式都要确认**（刻意不读 `ctx.mode`） | — | `data-tools.ts` |
| 13 | `open_form` | form | act | 未获会话授权且（`ask` 或带 `values`）时先申请 | — | `form-tools.ts` |
| 14 | `list_page_forms` | form | read | — | — | `form-tools.ts` |
| 15 | `fill_form` | form | act | 仅 `ask` 确认；`auto` 直接写 | — | `form-tools.ts` |
| 16 | `submit_form` | form | commit | 先过表单 `canSubmit()`，再弹审批（见 §5 待修） | — | `form-tools.ts` |

**过滤点**（`getAllowedTools`，就在这一处）：
① 权限档 → 名字集合；② `hasForms === false` 时剔掉 `group === 'form'` 的 4 个定义；
③ `surface === 'sphere'` 时剔掉 `update_search_params` / `get_page_data` / `run_page_command`。

**结果截断**：单条工具结果 ≤ 6000 字符（`truncatePayload`），截断时**明确告知模型**。
**工具循环**由 SDK 负责（`stopWhen: isStepCount(MAX_TOOL_STEPS = 30)`）。

### 3.3 审批矩阵（模式 × 工具）

| 工具 | `ask` | `auto` | 备注 |
|---|---|---|---|
| read 类（1/2/4/5/7/9/10/11/14） | 直接执行 | 直接执行 | — |
| `navigate_to`（3） | 面板：三选一确认卡（带我去 `once` / 本会话自动跳转 `session` / 先不跳 `deny`）；开「自动跳转」则免问 | 直接跳 | 全屏永远是建议卡，**不写授权** |
| `open_form`（13） | 首次或带 `values` 时申请 | 不带 `values` 时直接开 | 见 §5 |
| `fill_form`（15） | 确认 | 直接写 | — |
| `submit_form`（16） | 确认 | **当前实现仍确认**（见 §5） | 依据 `canSubmit()` |
| `call_write_api`（12） | 确认 | **仍确认** | 刻意设计：通用写接口没有可预览表单 |
| `run_page_command`（6） | write 一律确认 | write 一律确认 | 同 `call_write_api` 理由 |
| `request_permission`（8） | 弹授权卡 | 弹授权卡 | 用来主动申请 |

**三态决定**（`AiApprovalDecision`）：`deny` / `once`（不写任何授权）/ `session`（写会话授权）。
**fail-closed**：认不到决定就不执行；中止 / 异常时挂起审批一律按拒绝了结。
**审批发生在工具内部**（注册表那层不拦截），被拒时**抛错**（不静默跳过，否则模型会谎报成功）。

### 3.4 页面接入 AI 的两条路

**（新，推荐）`src/features` 一页一份 `feature.ts`** → `useFeature(spec)`：

| 声明 | 回答的问题 | 消费方 |
|---|---|---|
| `description` / `entities` / `endpoints` / `forms` / `searchParams` | 这一页是干什么的、用了哪些接口与表单 | `get_page_context` |
| `permissions` | 需要哪些权限点 | `hasPageCapabilityPermission`（唯一判定） |
| `commands` | **AI 能在这一页做什么**（含 `run`：页面自己的处理函数） | `run_page_command` |
| `dataSources` | **这一页现在有什么数据**（`state()` + 纯读 `read()`） | `get_page_data` |
| `reload` / `openForm` | 写后刷新 / AI 唤起表单 | `page-reload-bridge` / `open_form` |

注册键由 `useFeature` 从**当前路由**取（`router.state.matches.at(-1).routeId`），**不写 routeId**。

**（旧，仍在用）五件套**：`usePageCapabilities`（能力）、`useAiPageContext`（上下文）、
`useAiFormFields` + `useAiFormSubmit`（表单两半）、`useAiFormOpener`、`useAiPageReload`。
`useFeature` 内部会把能力同步给旧注册表，**新页面只写 `feature.ts`**。

已有 10 份 `feature.ts`：`home`、`users/user/{list,create,detail,edit}`、
`system/features/{list,create,node}`、`system/data-dict/{list,detail}`。

### 3.5 会话、持久化与授权

- **会话在 IndexedDB**（`session-db`，按 app 分区；元数据与消息两个 store）。
- **只写三处**：发送后（`await persist()`，坑 15）、一轮结束后、切 / 新建 / 删除会话时；流式期间不写盘。
- `loadHistory` 对**同一 app 早退**（面板重挂载不许用旧版本覆盖流式增量）；
  `fresh: true` 由 `isDocumentReload()` 决定（`aiSessionMode === 'new'` 时每份文档一段新会话）。
- **会话级授权**（`session-permissions`）：按 `appId + sessionId` 隔离、存 sessionStorage、**刷新即清**；
  未落盘的新对话用 `draft` 作用域。项目键：工具名 / `NAVIGATION_GRANT`（`'navigate'`）/ `'group:form'`。
- 当前会话 `activeSessionId === null` 表示「还没落盘的新对话」，不为空对话建记录。

### 3.6 本机偏好设置项（`admin.preferences:<appId>`，14 项）

| 字段 | 类型 | 默认 | 影响 |
|---|---|---|---|
| `aiEnabled` | boolean | `true` | AI 功能总开关 |
| `aiPanelMode` | `split \| float` | `split` | 面板形态（设置页文案键 `aiDisplayMode`） |
| `aiSessionMode` | `continue \| new` | `continue` | 新会话时机 |
| `aiComposerMode` | `ask \| auto` | `ask` | **模式**（要不要问） |
| `aiPageWidth` | `follow \| full \| boxed` | `follow` | 内容区宽档（面板/全屏共用） |
| `aiActivityGlow` | boolean | `true` | 进行中页面光晕 |
| `aiShowToolCalls` | boolean | `false` | 工具调用卡片可见性（审批卡与「正在思考…」不受影响） |
| `aiBotAvatar` | 18 个字面量 | `clover` | 助手头像形状 |
| `aiOutputMode` | `stream \| wait` | `wait` | 流式 vs 整段呈现 |
| `aiAutoScroll` | boolean | `true` | 默认跟随滚动（运行时「暂停」是另一件事） |
| `aiAutoNavigate` | boolean | `false` | 询问模式下跳转也免问（**只影响面板**） |
| `aiPermission` | `full \| readonly \| custom` | `readonly` | **权限** |
| `aiAllowedTools` | `string[]` | `[]` | 自定义档勾选 |
| `aiOutputLanguage` | `auto \| LocaleKey` | `auto` | AI 输出语言（与界面语言两个维度） |

另有两个**外壳级**（`admin.shell-ui`，同样不持久化展开态）：`aiPanelWidth`、`aiFloatWidth` / `aiFloatHeight`。

### 3.7 厂商与模型（`admin.ai`，全局一份、不按应用隔离）

- 两张表：`providers: AiProviderConfig[]` + `models: AiModelConfig[]` + `activeModelId`。
  删厂商**连带删它的模型**并清理 `activeModelId`。
- 协议收敛为**两大规范**：`kind: 'openai' | 'anthropic'`；OpenAI 规范下再分
  `openAiFormat: 'compatible'`（Chat Completions，默认，兼容 DeepSeek / Ollama / SiliconFlow 等）
  与 `'official'`（Responses）。
- **API Key 明文存 localStorage**（用户已确认）：密码框、编辑不回显、**任何日志 / toast / 错误都不许回显**。
- `AiModelConfig`：`supportsTools` / `reasoningLevels`（用户声明，7 档可选）/
  `reasoning` / `supportsVision`。
- **思考程度只有一条通路**：AI SDK v7 顶层 `reasoning` 参数；Anthropic 额外补
  `providerOptions.anthropic.thinking.budgetTokens`（1024 / 2048 / 4096 / 8192 / 16384）。
  **别改成只用 `providerOptions`**（会覆盖顶层参数）。
- 兼容：`ThinkTagStreamParser` 把普通文本流里的 `<think>…</think>` 提升为 `reasoning` 事件。

### 3.8 `@` 引用

`@模块` / `@模块:页面` / `@模块:记录id`，在 `runtime.toModelMessages()` 里
由 `expandRouteRefs` 追加一段「模块 / 页面 / 路径」说明（**只对 user 消息**、**认不出就原样留着**）。
模块规范表 `AI_ROUTE_REF_SPECS` 只登记「键 → 导航相对路径」，名字 / 图标 / 关键词全部取自导航清单；
当前只登记了 `user` 一个模块。

---

## 4. 代码地图（Code）

### 4.1 `lib/ai/**`（27 个文件）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `chat.ts` | 345 | 一轮消息驱动：读偏好 → 挑工具 → 拼消息 → 消费事件流；审批 Promise 通道；`StreamEventBatcher`；`stopAiMessage` |
| `runtime.ts` | 569 | 唯一 `import 'ai'`：建 provider 模型、`toSdkTools`、`streamText`、`fullStream` → `AiStreamEvent`、`ThinkTagStreamParser`、`toModelMessages`（历史衰减 3 轮 + 附件转 part + `@` 展开） |
| `types.ts` | 312 | 公共类型：`AiToolAccess` / `AiToolGroup` / `AiMode` / `AiSurface` / `AiPermissionMode` / `AiApprovalDecision` / `AiToolContext` / `AiToolDefinition` / `AiMessage(Part)` / `AiStreamEvent` |
| `index.ts` | 31 | 能力出口 barrel；**刻意不导出 `runtime`**（避免 SDK 进主 bundle） |
| `prompt-facts.ts` | ~70 | **事实采集**（页面上下文 / 导航 / 任务 / 语言）—— 随请求上报给中间层；**规则不在这里**（在服务端） |
| `tools/index.ts` | 128 | `AI_TOOLS` 注册表（唯一真值）+ `resolveAllowedToolNames` + `getAllowedTools`（权限/表单组/容器三处过滤）+ `findTool` |
| `tools/page-tools.ts` | 273 | `get_page_context` / `list_navigation` / `navigate_to`；`collectNavigation`（导航清单唯一出口）+ `isAllowedPath`（站内路径白名单，前缀匹配，支持详情页） |
| `tools/data-tools.ts` | 415 | `search_api` / `call_read_api` / `list_dict_options` / `call_write_api`；白名单解析（模板 + `pathParams`）、`truncatePayload`、写后刷新 |
| `tools/form-tools.ts` | 319 | `open_form` / `list_page_forms` / `fill_form` / `submit_form`；字段白名单（只放行表单声明的字段） |
| `tools/feature-tools.ts` | 179 | `get_page_data` / `run_page_command`（页面特性层消费方） |
| `tools/search-tools.ts` | 82 | `update_search_params`（页面调度器优先，URL 兜底） |
| `tools/task-tools.ts` | 92 | `manage_tasks` + `getLatestSessionTasks`（L7 的数据源） |
| `tools/permission-tools.ts` | 56 | `request_permission`（主动申请授权） |
| `page-context.ts` | 229 | `getPageContext()`（整体不缓存）、`resolveNavLabel`（有缓存）、外壳桥 `registerAiShellBridge` / `getAiShellBridge` |
| `page-context-registry.ts` | 111 | `useAiPageContext(Route.id, spec)` 注册表（模块级 Map，不进 state） |
| `page-capabilities.ts` | 276 | 页面能力 JSON 规格 + `filterPageCapabilities` / `resolveActivePageCapabilities` / `usePageCapabilities`；**权限判定唯一实现** `hasPageCapabilityPermission` |
| `endpoint-specs.ts` | 74 | 接口参数明细查询：懒加载 `endpoint-specs.gen` + `/api` 前缀归一化三写法 |
| `route-refs.ts` | 279 | `@` 引用：`AI_ROUTE_REF_SPECS` / `listRouteRefItems` / `expandRouteRefs` |
| `form-bridge.ts` | 200 | 表单桥：`useAiFormFields`（表单组件）+ `useAiFormSubmit`（页面组件）+ `useAiFormOpener` / `openPageForm` / `hasPageFormCapability` |
| `page-reload-bridge.ts` | 63 | `useAiPageReload` / `reloadAiPageData`（写操作后让页面按自己的语义重新取数） |
| `search-params-bridge.ts` | 60 | `useAiSearchParamsUpdater` / `updatePageSearchParams`（`useTableQuery` 注册调度器） |
| `session-store.ts` | 528 | zustand 会话状态：消息 / status / pendingApproval / IDB 落盘 / 会话切换；`deriveSessionTitle` |
| `session-db.ts` | 212 | IndexedDB 读写（按 app 分区，元数据 + 消息两个 store） |
| `session-permissions.ts` | 185 | 会话授权账本（sessionStorage + 内存缓存）、`NAVIGATION_GRANT`、刷新即清 |
| `session-boot.ts` | 58 | `isDocumentReload()`（`pagehide` 删标记，bfcache 不算重载） |
| `session-groups.ts` | 98 | 会话列表纯展示口径（时间分组 + 相对时间），两处列表共用 |
| `panel-session.ts` | 95 | 面板 / 全屏之间的会话级 UI 记忆（展开态、最大化来源 href、跳过入场动画标记） |

### 4.2 页面特性层

| 文件 | 行数 | 职责 |
|---|---:|---|
| `lib/features/types.ts` | 114 | `FeatureSpec` / `FeatureCommandSpec` / `FeatureDataSourceSpec` 契约 |
| `lib/features/define.ts` | 33 | `defineFeature` |
| `lib/features/registry.ts` | 114 | 注册表 + `resolveFeature` / `resolveFeatureCommands`（权限过滤）/ `readFeatureData` |
| `lib/features/use-feature.ts` | 61 | `useFeature(spec)`：注册特性、同步能力、接表单桥与重载桥 |
| `lib/features/convert.ts` | 67 | `PageCapabilitiesSpec` / `AiPageContextSpec` 转换 |
| `lib/features/index.ts` | 27 | barrel |
| `src/features/**/feature.ts` | 10 份 | 各页面声明（参考实现：`users/user/list/feature.ts`，279 行） |

### 4.3 UI 组件（`components/ai-*.tsx`，11 个，4411 行）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `ai-composer.tsx` | 1313 | 输入区：文本、附件（`AI_MAX_ATTACHMENTS=4` / 图片 4MB / 文本 256KB）、模型与思考程度、模式菜单、`@` mention、任务卡 |
| `ai-panel.tsx` | 1120 | 面板本体：split / float 两形态、头行、权限视图（整块替换内容）、拖拽与折叠动画 |
| `ai-conversation.tsx` | 830 | 消息渲染：Markdown、工具卡片（默认隐藏）、审批卡、导航建议卡、空态 |
| `ai-permission-config.tsx` | 293 | 权限三档 + 工具勾选（名单取自 `AI_TOOLS`）；`settings` / `panel` 两形态 |
| `ai-task-card.tsx` | 202 | 任务清单卡片（会话内 + 悬浮） |
| `ai-activity-glow.tsx` | 178 | 进行中页面光晕（`border-beam`） |
| `ai-session-list.tsx` | 145 | 浮层会话列表（搜索 + 分组 + 删除） |
| `ai-conversation-scroller.tsx` | 139 | 会话滚动容器（RAF 驱动、上翻暂停、回到底部） |
| `ai-session-picker.tsx` | 86 | 头行会话选择器 + `useActiveSessionTitle` |
| `ai-session-delete-dialog.tsx` | 56 | 删除确认弹窗（两处共用） |
| `ai-bot-avatar.tsx` | 49 | `bot-avatars` 封装（`theme` 必须我们传） |

**AI 消息渲染外围**：`markdown-content.tsx`(30) → `markdown-renderer.tsx`(147)、
`pretext-stream-text.tsx`(80) → `lib/pretext/**`（仓库自带，非 npm 依赖）。挂载点：`app-shell.tsx`。

### 4.4 路由：全屏对话页（`routes/$appId_.sphere/**`，10 个文件，1102 行）

`route.tsx`(225，逃离 `$appId` 布局、注册 `AiShellBridge` + 过渡 Provider)、`index.tsx`(28，新会话)、
`chat/$chatId.tsx`(42，loader 校验后 `notFound`)、`-components/` 下 `sphere-chat`(74)、
`sphere-header`(95)、`sphere-sidebar`(211)、`sphere-not-found`(52)、`sphere-transition`(175)、
`session-search-dialog`(154)、`use-sphere-collapse`(46)。

### 4.5 设置页（5 个文件，2247 行）

`settings/AI.tsx`(839，通用设置 + AI 权限 + 厂商 + 模型 + 5 个预览组件)、
`-components/ai-provider-card.tsx`(372)、`ai-model-card.tsx`(351)、
`ai-provider-export-dialog.tsx`(409)、`ai-provider-import-dialog.tsx`(276)。

### 4.6 Store（2 个，1067 行）

`lib/store/ai-store.ts`(346，`admin.ai`) 与 `lib/store/preferences-store.ts`(721，AI 字段见 §3.6)。

### 4.7 i18n

- `messages/ai/*.json`：7 语言各 **126 个叶键**（100 个顶层键 = 95 直接键 + 5 分组：
  `tools` 15 / `sessionGroups` 5 / `greetings` 3 / `toolDetail` 3 / `taskCard` 5）。
  **7 语言键集合完全一致**（`pnpm guardrails` 全量校验）。
- `common` 命名空间 `profile.settings.ai*` 约 86 个键（通用设置 / 枚举项 / 权限 / 厂商模型 / 导入导出）；
  入口名 `profileNav.ai` / `askAi`（「Ask AI」是产品名，各语言保留原文；`aiModes.split/float` 必须本地化）。
- AI 引用的 `nav.*` 只有 `nav.userDetail`（`@` 引用的详情页名字）。

### 4.8 脚本、依赖、门控

- 生成：`apps/web/scripts/gen-endpoint-specs.js`（读 `packages/api-contract/openapi.json` →
  `apps/web/src/api/endpoint-specs.gen.ts`，**不要手改**；由 `pnpm api` 编排）；
  产物当前 **7324 字节 / 24 条**。
- `apps/web/scripts/gen-query-params.js`（`USER_FILTER_FIELDS` 等编译期查询参数）。
- 门控：`scripts/ai/check-guardrails.mjs`（`pnpm guardrails`：i18n 键树全量一致 + diff 内禁用样式）。
- 依赖：`ai@^7.0.116`、`@ai-sdk/anthropic@^4.0.65`、`@ai-sdk/openai@^4.0.77`、
  `@ai-sdk/openai-compatible@^3.0.57`、`bot-avatars@^0.1.1`、`border-beam@^1.4.1`、
  `react-markdown@^10.1.0`、`remark-gfm@^4.0.1`、`motion@^13.4.4`。
- 被 `#/lib/ai` 引用的**非内部文件共 23 个**：11 个 AI 组件、7 个 sphere 文件、
  `app-shell.tsx`、`use-table-query.ts`、`lib/features/{use-feature,types,convert,registry}.ts`、
  业务表单页 5 个。`AI_TOOLS` 与 `sendAiMessage` 各只有**一个**消费点。

---

## 5. 现状与文档 / 代码不一致（待修）

以下为盘点时发现的事实差异，**未改代码**。前 3 条是文档滞后，后 4 条是代码层面待确认项。

| # | 位置 | 现象 | 建议 |
|---|---|---|---|
| 1 | `ai-architecture.md` §5 | 写「工具定义 10 个工具（无表单时 7 个）」，实际 `AI_TOOLS` **16 个**（无表单时 12 个） | 改成 16，并按 §3.2 补全工具表 |
| 2 | `ai-architecture.md` §1 / §3 | §1 的 L5 只列 4 个工具文件（实际 8 个）；§3 的审批表格未覆盖 `open_form` / `run_page_command` / `manage_tasks` / `request_permission` | 按本文 §3.2 / §3.3 同步 |
| 3 | `ai-architecture.md` §4 / §5、`lib/ai/endpoint-specs.ts` 注释 | 写「接口参数索引 363 KB / gzip 23.6 KB」「全局接口清单 600+ 条」，实际 `endpoint-specs.gen.ts` **7.3 KB / 24 条**；注释里的 `scripts/gen-endpoint-specs.js` 路径实际是 `apps/web/scripts/gen-endpoint-specs.js` | 更新量级与路径 |
| 4 | `lib/ai/chat.ts:159` | 使用 `AiStreamEvent` 但**顶部没有 import 它**（`import type` 列表缺一项）→ `tsc --noEmit` 会报 `Cannot find name` | 补一个 `import type` 即可（用 `verify` skill 确认） |
| 5 | `lib/ai/tools/form-tools.ts:287` | `formSpec?.submission?.requireApproval ?? (ctx.mode === 'ask' \|\| true)` —— 右侧**恒为 true**，于是 `submit_form` 在 `auto` 模式**仍然弹审批**，与工具描述、`ai-architecture.md` §3 表格（auto 下 `canSubmit()` 通过即提交）矛盾 | 去掉 `\|\| true`，改为按 `ctx.mode` / 声明判定 |
| 6 | `lib/ai/route-refs.ts:276` | `expandRouteRefs` 追加的说明**硬编码面板策略**（「必须优先 `navigate_to` … 配合 `update_search_params` … 切勿直接调用只读接口」），与 §8.1「策略由提示词按容器给、工具描述保持容器中立」冲突；**全屏容器**里 `update_search_params` 根本不下发，模型会被引向一个不存在的工具 | 改为容器中立的表述（或按 `surface` 分策略，与 `workflow.ts` 同源） |
| 7 | i18n | `common:profile.settings.aiToolNames.*` 只覆盖 **10 / 16** 个工具（缺 `open_form`、`get_page_data`、`run_page_command`、`manage_tasks`、`request_permission`、`update_search_params`）；`ai:tools.*` 覆盖 15 / 16（缺 `request_permission`）。组件有 `t(key, tool.name)` 兜底，因此**权限界面与工具卡片会显示英文蛇形原名** | 补 7 语言的 6 个工具名（铁律 1：7 语言齐） |

---

> 更新本文的时机：**新增 / 删除工具、加一层提示词、加一个 AI 设置项、加一个 AI 文件**。
> 叙述与理由仍以 [`ai-architecture.md`](./ai-architecture.md) 为准 —— 本文只保证「清单不缺项」。
