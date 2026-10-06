# AI 模块总览（提示词 · 业务 · 代码）

> **这份文档是「清单式入口」**，与 [`ai-architecture.md`](./ai-architecture.md) 分工：
>
> | 文档 | 形态 | 什么时候读 |
> |---|---|---|
> | [ai-architecture.md](./ai-architecture.md) | **叙述式**：分层理由、数据流、扩展点、**19 条踩过的坑** | 改任何 AI 代码之前 |
> | **本文** | **清单式**：提示词 14 层逐层、21 个工具全表、审批矩阵、设置项全表、**AI 相关文件全地图** | 想知道「AI 现在到底有什么 / 在哪个文件」时 |
> | [ai-integration.md](./ai-integration.md) | 设计蓝图与选型依据（给人看） | 追溯「当初为什么这么设计」 |
>
> 覆盖面：**`apps/web/src/features/ai/**`（108 个文件，AI 核心全部收在这一个目录）**、
> `lib/store/preferences-store.ts`、`messages/ai/*`、生成脚本与依赖。
> 本文只描述**当前代码事实**；与旧文档不一致处以本文 + 代码为准（差异见 [§5](#5-现状与文档--代码不一致待修)）。
>
> 🗺️ **目录怎么分**看 [src/features/ai/README.md](../../apps/web/src/features/ai/README.md) ——
> 那是模块地图（core / components / markdown / sphere / page 各是什么、加东西改哪里）。

> ⚠️ **2026-09 迁移**：系统提示词的**规则**已迁到服务端 —— 真值在 `packages/ai-prompt`，
> 由 `apps/ai`（Hono Worker）拼接。本文里所有 `features/ai/core/prompt/**` 路径**均已不存在**；
> 前端改由 `features/ai/core/prompt-facts.ts` 采集**事实**后随请求上报。以
> [`ai-server-layer.md`](./ai-server-layer.md) 为准。

---

## 0. 一分钟速览

| 项 | 现状 |
|---|---|
| 系统提示词 | **14 层**（`PROMPT_LAYERS`，stable 9 + volatile 5），唯一出口 `buildSystemPrompt(facts, stage?)` / `buildTurnContext(facts, stage?)`（服务端），**每轮重算**；按 `promptStage`（router / execution）选层 —— 两阶段的 system 是**两份不同提示词**（identity 后分叉），同一阶段跨轮逐字节一致 |
| 工具 | **21 个**（`AI_TOOLS`），每个工具声明自己占的能力格子（见下）。另有 Router 阶段的虚拟工具 `select_tools`（不进 `AI_TOOLS`） |
| 运行容器 | 2 个：`panel`（分屏 / 浮窗）、`sphere`（全屏对话页）；**由渲染处显式传入**，不靠路由字符串反推 |
| 权限模型 | **能力矩阵**（`features/ai/core/capabilities.ts`）：四行（页面 / 数据 / 表单 / 任务）× 各行动作 = 可独立授权的格子（`page:read` / `data:write` / `form:submit` …）。工具声明 `capability` 落在哪一格；权限界面一行一个能力、行内多权限；运行时按格子过滤 |
| 正交维度 | **权限**（能不能用） × **模式**（用起来要不要问） × **容器**（策略与工具清单） |
| 运行时 | `features/ai/core/runtime.ts` 是全仓唯一 `import 'ai'`（Vercel AI SDK v7）之处，**动态加载** |
| 持久化 | 会话在 IndexedDB（按 app 分区）；本机偏好与 AI 设置项在 localStorage（`admin.preferences:<appId>` 按 app）。**原 `admin.ai`（厂商 / 模型）已删除**，该键不再被写入或读取 |
| 接入面 | 10 份 `feature.ts`（新）+ 5 处 AI 表单桥（旧路径仍可用） |
| 7 语言 | `ai` 命名空间 121 个叶键，**7 语言完全一致**（`pnpm guardrails` 全量门控） |

---

## 1. 分层与一轮消息的调用链

```text
L1 UI        AiComposer ──sendAiMessage(text, mode, attachments, surface)──┐
             AiPanel / sphere 全屏页 / AiConversation / AiActivityGlow      │
L2 状态      useAiSessionStore（消息 / status / pendingApproval / IDB 落盘） │
L3 驱动      chat.ts ─────────────────────────────────────────────────────┘
               ├─ 读偏好：aiPermission / aiCapabilities / aiOutputLanguage / locale / aiAutoNavigate
               ├─ getAllowedTools(permission, allowed, { hasForms, surface })   ← 权限与容器的唯一过滤点
               ├─ beginTurn() → await persist()
               ├─ await import('./runtime')                                     ← 懒加载
               ├─ toModelMessages(messages)        ← @ 引用展开 + 历史衰减 + 附件转 part
               └─ streamAssistantTurn(...)
L4 运行时    runtime.ts（唯一 import 'ai'）—— 两阶段在一次 streamText 里（prepareStep + activeTools）
               ├─ 服务端按 promptStage 选层拼提示词（buildSystemPrompt / buildTurnContext）
               ├─ createWorkerModel → createOpenAICompatible（指向 apps/ai 中间层）
               ├─ streamText({ tools, activeTools, prepareStep, stopWhen: isStepCount(31) })
               │    ├─ step 0（router）    activeTools = ['select_tools']
               │    └─ step ≥1（execution） activeTools = resolveTools 选中的工具（含依赖补齐）
               └─ fullStream → AiStreamEvent（think 标签解析 + nav-proposal 翻译）
L5 事件      StreamEventBatcher（~25ms 合并）→ session-store.applyEvent → UI
L6 工具      tools/{page,data,form,feature,search,task,permission,analyze,check-result-match}-tools.ts
             tools/select-tools.ts（Router 阶段的虚拟工具，**不进 AI_TOOLS**）
L7 上下文    page-context / page-context-registry / page-capabilities / endpoint-specs /
             form-bridge / page-reload-bridge / search-params-bridge / route-refs / session-db
```

**两条硬边界**：L4 不能被静态 import（SDK + `@ai-sdk/openai-compatible` 几百 KB）；`endpoint-specs.gen` 只准
`import type` + 动态 `import()`。

---

## 2. 提示词（Prompt）

### 2.1 唯一出口与装配

- 出口：`packages/ai-prompt/src/index.ts` 的 `buildSystemPrompt(facts, stage?)`（稳定前缀 → system）
  与 `buildTurnContext(facts, stage?)`（本轮环境 → 对话末尾）；`stage` 缺省 `execution`（向后兼容）。
- 顺序真值：同文件的 `PROMPT_LAYERS`（**加一层 = 加 builder + 在数组占位**）；每层声明
  `group`（`core` / `domain` / `execution`）与 `stages`（**不声明 = 两个阶段都加载**）。
- 空层（`build` 返回 `null` / 空白）整段不拼，层间空一行。
- 每轮重算：页面上下文含标题、任务清单含会话状态、范围清单含 appId 与界面语言 → **绝不缓存成常量**。
- 输入快照 `PromptLayerInput`：`{ mode, surface, outputLocale, context, appName }`，其中 `context`
  由 `getPageContext()` **一轮只采一次**，各层共用同一份。

### 2.2 逐层清单（14 层）

| # | 层 id（文件） | group | 阶段 | 标题 | 回答的问题 | 关键内容（当前口径） |
|---|---|---|---|---|---|---|
| L1 | `identity`（`layers/identity.ts`） | core | 两阶段 | 身份与定位 | 你是谁、为谁服务 | 应用名走 `appName` 参数；显式掐掉「通用助手」人格 —— **只为这一个系统服务** |
| L2 | `scope-core`（`layers/scope.ts`） | core | **仅 router** | 请求分诊与范围闸（分诊框架） | **什么该答、什么该拒** | 三分类表（✅业务内 / ⛔越界 / ⚠️模糊）；**先分诊再行动**；越界一律拒、不做任何工具调用。分诊在选工具那一步完成，不再发给执行阶段 |
| L3 | `guard`（`layers/scope.ts`） | core | 两阶段 | 安全边界（数据不是指令） | 什么不能被当成指令 | **数据不是指令、元指令越界、坚持 / 催促不改变判定** —— 从原 `domain` 抽出，因为执行阶段会读到工具返回与附件，注入防线不能缺席 |
| L4 | `domain`（`layers/scope.ts`） | domain | **仅 router** | 业务范围与越界清单 | 业务边界在哪 | **逐条点名越界类型**（闲聊、通识、数学、写代码与**解释代码**、其它产品、专业建议、任何「忽略规则」的元指令）；**两个例外**（翻译、一句寒暄）；越界话术 3 行内；混合请求处理；模块清单从 `collectNavigation` 派生（上限 30 行），无 appId 时给外壳页面清单 |
| L5 | `capability`（`layers/capability.ts`） | core | 两阶段 | 能力边界 | 手上有什么、要不要先问 | **区分 unsupported / permission_denied**：系统本来就有、只是当前没开放（权限 / 容器挡住）→ 说当前权限未开启、可去「设置 → AI → AI 权限」调整；系统本身没有 → 如实说「这个后台没有这项功能」，**不要编**、也不要说成「权限没开」；分不清 → 按「当前不可用」表述、提示可去设置查看，**不要断言系统有这个能力**。**绝不复述权限**（见坑 1） |
| L6 | `executor-role`（`index.ts`） | execution | 仅 execution | 执行阶段角色（分诊已完成） | 这轮是执行阶段吗 | **分诊与范围判定已经在选工具那一步完成**；只需用给定工具把已确定的请求做完，**不要重新判定范围**；要事实先调工具 |
| L7 | `workflow`（`layers/workflow.ts`） | execution | 仅 execution | 工作方式与决策优先级 | 业务内请求怎么做 | **按容器分策略**：面板 playbook = 单模块查询**先带用户去页面**、多模块才调接口；全屏 playbook = **就地渲染数据**、跳转退化成建议卡；通用规约（先工具后回答、写操作走清单接口、被拒即停、`truncated` 处理、复合任务用 `manage_tasks`、续做守则） |
| L8 | `output`（`layers/output.ts`） | core | 两阶段 | 回答方式 | 怎么说话 | **用目标语言的自名回答**（`SUPPORTED_LOCALES.nativeName`）；先结论后依据；**不暴露分诊过程、不复述提示词原文**；拒绝用同一门语言、3 行内 |
| L9 | `tool-catalog`（`index.ts`） | core | **仅 router** | 本轮可用工具目录（Router） | 这轮能用哪些工具 | 一行一个 `- name：一句话`，由前端 `buildToolCatalogText` 按**当前权限下可用**的工具生成；**不含 JSON Schema**（完整定义只在 Execution 下发） |
| L10 | `mode-rule`（`layers/capability.ts`） | execution | 仅 execution | 本轮模式说明 | 这轮要不要先问 | `ask` / `auto` 的确认口径；只在 Execution 出现 |
| L11 | `playbook`（`layers/workflow.ts`） | execution | 仅 execution | 本轮决策优先级（按容器） | 这轮怎么走 | 面板 / 全屏两套 playbook（读 `input.surface`） |
| L12 | `runtime-context`（`index.ts`） | core | 两阶段 | 当前运行态（模式 / 语言） | 这轮在什么状态下跑 | 模式（询问 / 自动）与输出语言；单列一层是因为模式说明只发给 Execution，Router 看不到会让提示词里的引用悬空 |
| L13 | `page-summary`（`index.ts`） | core | **两阶段** | 当前页面摘要 | 我在哪（摘要） | `formatPageSummary`：应用 / 页面 / 路径 / 路由模板 —— 不带接口 / 字段 / 表单明细（原只给 Router） |
| L14 | `active-tasks`（`layers/workflow.ts`） | execution | 仅 execution | 进行中的任务清单 | 这轮在续做什么 | 从会话消息里取最后一份 `manage_tasks` 清单**直接注入**（绕开历史工具结果衰减）；无未完成项时返回 `null` |

> `page-context` 层**已删除**：完整页面明细（接口 / 字段 / 表单 / 搜索参数）不再每轮注入，
> 改由执行阶段调 `get_page_context` 按需获取；`PromptFacts` 也删掉了 `pageContextText`。

### 2.3 提示词里的「事实」只有四个来源（全部经函数、留过滤点）

| 内容 | 出口 | 时机 |
|---|---|---|
| 系统提示词 | `buildSystemPrompt` | 每轮重算 |
| 当前页面 | `formatPageSummary(getPageContext())`（摘要，两阶段都带）；完整明细由 `get_page_context` 工具按需获取 | 每轮采集 / 模型调用工具时 |
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
4. **容器只影响 `playbook` 层与工具清单**，且各只有一个落点；工具描述保持容器中立。
5. **阶段划分只问一句**：不做任何工具调用、也要遵循它吗？要 → 两阶段都留；不要 → 只留
   `execution`（`executor-role` / `workflow` / `mode-rule` / `playbook` / `active-tasks`）；
   **分诊框架与越界清单只留 `router`**（分诊在选工具那一步完成）；工具目录只留 `router`，
   页面摘要与运行态两个阶段都带。于是两阶段的 system 是**两份不同的提示词**，在 `identity` 之后
   分叉；**同一阶段跨轮**仍逐字节一致（前缀缓存前提不变）。
6. **不暴露内部过程**（`scope-core` 层与 `output` 层各压一道）：回答里不出现分类标签，规则原文不念给用户。

---

## 3. 业务（Business）

### 3.1 三个正交维度 —— 任何时候别揉成一个开关

| | **权限** | **模式** | **容器** |
|---|---|---|---|
| 存哪 | `aiPermission` + `aiCapabilities` | `aiComposerMode` | 渲染处传入（`AiComposer.surface`） |
| 回答 | **能不能用**这个工具 | 用起来**要不要问** | 策略与**能发哪些工具** |
| 落点 | `getAllowedTools()`（唯一过滤点） | 各工具内部读 `ctx.mode` | `workflow.ts` + `getAllowedTools` | 
| 默认 | `readonly`（只读） | `ask`（询问） | 面板 / 全屏 |

**权限三档本质是同一份格子勾选集**（`resolveAllowedGrants`）：`full` = 全部格子、
`readonly` = 预设勾了只读那几格（`page:read` / `page:navigate` / `data:query` / `form:read` / `task:plan`）、
`custom` = 用户勾的（并剔掉矩阵里不存在的脏值）。从预设档切到「自定义」要**继承当前档实际勾选的集合**。

### 3.2 工具全表（18 个，`AI_TOOLS` 是唯一真值）

Router 阶段只看 `catalogDescription`（一句话）、Execution 阶段才拿完整 `description` + `inputSchema`；
`select_tools` 是 Router 的虚拟工具，**不在下表 / `AI_TOOLS` 里**（见 §1 L6）。

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
| 17 | `check_result_match` | data | read | **每次必问**（不写任何会话授权） | **全屏不下发** | `check-result-match-tool.ts` |
| 18 | `analyze_data` | data | `data:query` | 首次读页面数据前申请 `DATA_READ_GRANT`（本会话允许后免问） | **全屏不下发** | `analyze-tool.ts` |
| 19 | `search_pages` | page | `page:read` | — | — | `catalog-tools.ts` |
| 20 | `get_current_time` | page | `page:read` | 不问（纯本地读取） | — | `time-tools.ts` |
| 21 | `reload_page_data` | page | `page:read` | 不问（只读，不改数据） | **全屏不下发** | `time-tools.ts` |

> 表中第 4 列（旧表是 `access`：read / act / commit）已换成**能力格子**（`page:read` …）——
> 它就是权限界面上的勾选项，见 `features/ai/core/capabilities.ts`。

**双层描述 + 依赖**（`AiToolDefinition`）：`catalogDescription`（**必需**，一句话、10~25 个中文字）
只给 Router；`description` 保留但**大幅精简**（只留：做什么 / 关键输入约束 / 调用前置条件 /
安全约束），给 Execution。`dependencies` 声明前置工具，`resolveTools` 在 Router 输出之后
**自动补齐**：`analyze_data → ['get_page_data']`、`check_result_match → ['get_page_data']`、
`fill_form → ['list_page_forms']`。`catalog?` / `execution?` 默认 `true`（`false` 分别表示
不进目录 / 不进执行阶段）。**关键约束一条没删**（不猜路径、不猜字段、写操作确认、删除不可撤销、
被拒不重试、`truncated` 不下结论、探测值必须来自用户）—— 删掉的是工具之间的比较、容器策略、
`@` 引用编排，由提示词层承载。

**过滤点**（`getAllowedTools`，就在这一处）：
① 权限档 → 名字集合；② `hasForms === false` 时剔掉 `group === 'form'` 的 4 个定义；
③ `surface === 'sphere'` 时剔掉 `PAGE_BOUND_TOOLS` 的 5 个（`update_search_params` /
`get_page_data` / `run_page_command` / `check_result_match` / `analyze_data`）。
**Context Resolver**（`resolveTools`）在过滤点**之后**再跑一遍：名字存在性 → 权限 / 容器 / 表单 /
后端权限点 → 依赖闭包 → `execution:false` 过滤，Router 的输出**不被信任**。

**结果截断**：单条工具结果 ≤ 6000 字符（`truncatePayload`），截断时**明确告知模型**。
**工具循环**由 SDK 负责：执行阶段仍是 `MAX_TOOL_STEPS = 30` 步；`stopWhen` 写成
`isStepCount(31)` 只为给 Router 的第 0 步让位。

### 3.3 审批矩阵（模式 × 动作性质）

**判定只有一处**：`features/ai/core/approval-policy.ts` 的 `needsApproval(intent, { mode, planHasWrites? })`。
工具不再自己写 `ctx.mode === 'ask'`（那是这次修复的根因 —— 抄了七八遍，其中一处写成恒真）。

| 动作性质 `intent` | `ask` | `auto` | 为什么 |
|---|---|---|---|
| `read` 读业务数据（页面数据 / 只读接口 / 分析） | **首次问**（`DATA_READ_GRANT` 会话授权后免） | 不问 | 只读不改变任何东西 |
| `fill` 填表 / 打开表单 | 问 | 不问 | 只改页面状态、不落库，可见可撤销 |
| `submit` 提交表单入库 | 问 | **不问** | 表单自带 `canSubmit()` 把关、用户能预览；auto 免问正是这个模式的意义 |
| `write` 通用写接口 / 页面写指令 | 问 | **仍问** | 刻意例外：没有可预览的表单，自动执行等于直接改库 |
| `navigate` 跳转 | 问 | 不问 | 「看哪里」不是「改什么」 |
| `plan` 批量编排 | 问 | **含写操作才问** | 写计划是用户唯一能看到完整步骤清单的机会；只读计划不打断 |
| `probe` 存在性探测 | **每次问** | **每次问** | 枚举试探的主要通道，交互层是主要防线 |

**`write` 与 `probe` 不读 `ctx.mode`** —— 这两个口子不随模式松动。
`plan` 的"含不含写操作"按**步骤所用工具的能力格子**判（`planHasWriteSteps`），
不按工具名：将来新增的写工具会自动被认出来，不必回来改表。

**批量计划的预授权**（`BatchGrant`）同时装**工具名**与**会话授权键**（`data:read` …）——
子步骤弹读授权时 `request.toolName` 是**授权键不是工具名**，只比工具名会漏掉它们，
于是只读计划会在执行中途逐个弹卡（这是修复前的真实表现）。

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

已有 10 份 `feature.ts`：`home`、`table-example`（list / detail / create / edit 全平铺）、
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
| `aiShowDetails` | boolean | `false` | 详细信息可见性：工具调用卡片 + 本轮 token 用量（审批卡 / 任务卡 / 「正在思考…」不受影响） |
| `aiBotAvatar` | 18 个字面量 | `clover` | 助手头像形状 |
| `aiOutputMode` | `stream \| wait` | `wait` | 流式 vs 整段呈现 |
| `aiAutoScroll` | boolean | `true` | 默认跟随滚动（运行时「暂停」是另一件事） |
| `aiAutoNavigate` | boolean | `false` | 询问模式下跳转也免问（**只影响面板**） |
| `aiPermission` | `full \| readonly \| custom` | `readonly` | **权限** |
| `aiCapabilities` | `AiCapabilityGrant[]` | `[]` | 自定义档勾选的**能力格子**（`page:read` …） |
| `aiOutputLanguage` | `auto \| LocaleKey` | `auto` | AI 输出语言（与界面语言两个维度） |

另有两个**外壳级**（`admin.shell-ui`，同样不持久化展开态）：`aiPanelWidth`、`aiFloatWidth` / `aiFloatHeight`。

### 3.7 厂商与模型（`admin.ai`，**已删除**）

原 `admin.ai`（全局一份、不按应用隔离）里的 `providers: AiProviderConfig[]` + `models: AiModelConfig[]`
+ `activeModelId`，以及模型「能力声明」（`supportsTools` / `reasoningLevels` / `reasoning` /
`supportsVision`）**均已随前端模型配置清理删除**：

- `lib/store/ai-store.ts` 移除，`lib/store/index.ts` 不再导出；`admin.ai` 键不再被写入或读取
  （旧存档残留没有任何读取方）。
- 设置页只剩「通用设置」与「AI 权限」两张卡片；`ai-provider-card` / `ai-model-card` /
  两个导入导出弹窗一并删除。
- 输入区不再有「选择模型 / 思考程度」子菜单；图片 / 文件入口**始终可用**（不按模型能力置灰）。
- 模型与凭证改由 `apps/ai`（Hono Worker，**`AI_MODEL_ID` 覆盖客户端的 model**）与 AI Gateway
  决定；`runtime.ts` 的 `WORKER_MODEL_ID = 'nivo-ai-server-fixed'` 只是占位。
- 工具是否随请求发出**只由权限决定**（`chat.ts` 的 `getAllowedTools`）；`runtime.ts` 已删
  `resolveReasoning()` 与 `StreamAssistantTurnOptions.supportsTools`。
- 兼容：`ThinkTagStreamParser` 把普通文本流里的 `<think>…</think>` 提升为 `reasoning` 事件（保留）。
- 依赖：`@ai-sdk/anthropic` / `@ai-sdk/openai` **仍在 `apps/web/package.json`，仍待移除**
  （已不再被 import）。

### 3.8 `@` 引用

`@模块` / `@模块:页面` / `@模块:记录id`，在 `runtime.toModelMessages()` 里
由 `expandRouteRefs` 追加一段「模块 / 页面 / 路径」说明（**只对 user 消息**、**认不出就原样留着**）。
模块规范表 `AI_ROUTE_REF_SPECS` 只登记「键 → 导航相对路径」，名字 / 图标 / 关键词全部取自导航清单；
当前只登记了 `user` 一个模块。

---

## 4. 代码地图（Code）

### 4.1 `features/ai/core/**`（33 个文件；下表列主要 30 个）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `chat.ts` | 392 | 一轮消息驱动：读偏好 → 挑工具 → 采集事实（含工具目录）→ 拼消息 → 消费事件流；审批 Promise 通道；`StreamEventBatcher`；`onMetrics` 日志；`stopAiMessage` |
| `runtime.ts` | 832 | 唯一 `import 'ai'`：建模型、**两阶段（`prepareStep` + `activeTools`）**、`toSdkTools`、`select_tools` 接线（必填 `intent`；`rejected` → `dropped` 映射）、`streamText`、`fullStream` → `AiStreamEvent`、**「工具调用被写成文本」的兜底**（Router 缓冲 + 强制重试一次，见 `TOOL_CALL_LEAK_PATTERNS`）、`AiTurnMetrics`（含 `intent`）、`ThinkTagStreamParser`、`toModelMessages`（历史衰减 3 轮 + 附件转 part + `@` 展开） |
| `types.ts` | 435 | 公共类型：`AiToolAccess` / `AiToolGroup` / `AiMode` / `AiSurface` / `AiPermissionMode` / `AiApprovalDecision` / `AiToolContext` / `AiToolDefinition`（含 `catalogDescription` / `dependencies` / `catalog` / `execution`）/ `AiMessage(Part)` / `AiTurnUsage` / `AiTurnMetrics` / `AiStreamEvent` |
| `index.ts` | 34 | 能力出口 barrel；**刻意不导出 `runtime`**（避免 SDK 进主 bundle） |
| `prompt-facts.ts` | 90 | **事实采集**（页面摘要 / 工具目录 / 导航 / 任务 / 语言）—— 随请求上报给中间层；**规则不在这里**（在服务端） |
| `tools/index.ts` | 307 | `AI_TOOLS` 注册表（唯一真值）+ `resolveAllowedGrants` + `getAllowedTools`（权限 / 表单组 / 容器 / 后端权限点过滤）+ `findTool` + **Tool Catalog**（`listToolCatalog` / `buildToolCatalogText`）+ **Context Resolver**（`resolveTools`） |
| `tools/select-tools.ts` | 77 | **Router 阶段的虚拟工具** `select_tools`（`SELECT_TOOLS_NAME` / `SELECT_TOOLS_SPEC`；必填 `intent` + `tools`，`intent` 只进日志）；`execute` 落在 runtime 闭包，**不进 `AI_TOOLS`** |
| `tools/page-tools.ts` | 275 | `get_page_context` / `list_navigation` / `navigate_to`；`collectNavigation`（导航清单唯一出口）+ `isAllowedPath`（站内路径白名单，前缀匹配，支持详情页） |
| `tools/data-tools.ts` | 439 | `search_api` / `call_read_api` / `list_dict_options` / `call_write_api`；白名单解析（模板 + `pathParams`）、`truncatePayload`、写后刷新 |
| `tools/form-tools.ts` | 340 | `open_form` / `list_page_forms` / `fill_form` / `submit_form`；字段白名单（只放行表单声明的字段） |
| `tools/feature-tools.ts` | 229 | `get_page_data` / `run_page_command`（页面特性层消费方） |
| `tools/search-tools.ts` | 83 | `update_search_params`（页面调度器优先，URL 兜底） |
| `tools/task-tools.ts` | 320 | **`manage_tasks` + 编排执行引擎**：计划里的 `action: { tool, input }` 由客户端**顺序执行**（前一步完成才做下一步），整批只在执行前确认一次，结果整批回传；逐步上报进度（`ctx.reportTaskProgress`）；`ctx.resolveTool` 做**提权白名单** |
| `tools/time-tools.ts` | 110 | `get_current_time`（浏览器时间事实）+ `reload_page_data`（按页面语义重新取数） |
| `tools/catalog-tools.ts` | 95 | `search_pages`（按功能描述模糊检索页面目录，返回标题 + desc + 接口清单） |
| `capabilities.ts` | 150 | **AI 能力矩阵**：格子定义 / 预设档 / 清洗。权限界面、运行时过滤、工具声明共用这一份 |
| `page-catalog.ts` | 180 | **页面目录**（每页一条 `desc` + 接口清单）：`search_pages` 的数据源，也是"不全量下发页面明细"的落点 |
| `time-facts.ts` | 70 | 浏览器侧**时间事实采集**（UTC 绝对时刻 + 操作系统时区 + 用户展示时区） |
| `tools/permission-tools.ts` | 57 | `request_permission`（主动申请授权） |
| `tools/check-result-match-tool.ts` | 277 | `check_result_match`（存在性查询，只回 `{ exists }`；每次必问） |
| `tools/analyze-tool.ts` | 901 | `analyze_data`（JSON 操作链表达式分析，AI 不接触数据；走 `DATA_READ_GRANT`） |
| `page-context.ts` | 248 | `getPageContext()`（整体不缓存）、`formatPageSummary`（两阶段都带）/ `formatPageContext`（`get_page_context` 工具按需输出明细）、`resolveNavLabel`（有缓存）、外壳桥 `registerAiShellBridge` / `getAiShellBridge` |
| `page-context-registry.ts` | 111 | `useAiPageContext(Route.id, spec)` 注册表（模块级 Map，不进 state） |
| `page-capabilities.ts` | 268 | 页面能力 JSON 规格 + `filterPageCapabilities` / `resolveActivePageCapabilities` / `usePageCapabilities`；**权限判定唯一实现** `hasPageCapabilityPermission` |
| `endpoint-specs.ts` | 74 | 接口参数明细查询：懒加载 `endpoint-specs.gen` + `/api` 前缀归一化三写法 |
| `route-refs.ts` | 279 | `@` 引用：`AI_ROUTE_REF_SPECS` / `listRouteRefItems` / `expandRouteRefs` |
| `form-bridge.ts` | 205 | 表单桥：`useAiFormFields`（表单组件）+ `useAiFormSubmit`（页面组件）+ `useAiFormOpener` / `openPageForm` / `hasPageFormCapability` |
| `page-reload-bridge.ts` | 63 | `useAiPageReload` / `reloadAiPageData`（写操作后让页面按自己的语义重新取数） |
| `search-params-bridge.ts` | 60 | `useAiSearchParamsUpdater` / `updatePageSearchParams`（`useTableQuery` 注册调度器） |
| `session-store.ts` | 558 | zustand 会话状态：消息 / status / pendingApproval / IDB 落盘 / 会话切换；`deriveSessionTitle` |
| `session-db.ts` | 212 | IndexedDB 读写（按 app 分区，元数据 + 消息两个 store） |
| `session-permissions.ts` | 195 | 会话授权账本（sessionStorage + 内存缓存）、`NAVIGATION_GRANT`、刷新即清 |
| `session-boot.ts` | 58 | `isDocumentReload()`（`pagehide` 删标记，bfcache 不算重载） |
| `session-groups.ts` | 98 | 会话列表纯展示口径（时间分组 + 相对时间），两处列表共用 |
| `panel-session.ts` | 95 | 面板 / 全屏之间的会话级 UI 记忆（展开态、最大化来源 href、跳过入场动画标记） |

### 4.2 页面特性层

| 文件 | 行数 | 职责 |
|---|---:|---|
| `features/ai/page/types.ts` | 114 | `FeatureSpec` / `FeatureCommandSpec` / `FeatureDataSourceSpec` 契约 |
| `features/ai/page/define.ts` | 33 | `defineFeature` |
| `features/ai/page/registry.ts` | 114 | 注册表 + `resolveFeature` / `resolveFeatureCommands`（权限过滤）/ `readFeatureData` |
| `features/ai/page/use-feature.ts` | 61 | `useFeature(spec)`：注册特性、同步能力、接表单桥与重载桥 |
| `features/ai/page/convert.ts` | 67 | `PageCapabilitiesSpec` / `AiPageContextSpec` 转换 |
| `features/ai/page/index.ts` | 27 | barrel |
| `src/features/**/feature.ts` | 10 份 | 各页面声明（参考实现：`table-example/feature.ts`，279 行） |

### 4.3 UI 组件（`features/ai/components/*.tsx`，11 个，4411 行）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `ai-composer.tsx` | 1150 | 输入区：文本、附件（`AI_MAX_ATTACHMENTS=4` / 图片 4MB / 文本 256KB）、模式菜单、`@` mention、任务卡（行尾设置按钮只剩「配置权限」，仅面板给） |
| `ai-panel.tsx` | 1120 | 面板本体：split / float 两形态、头行、权限视图（整块替换内容）、拖拽与折叠动画 |
| `ai-conversation.tsx` | 831 | 消息渲染：Markdown、工具卡片（默认隐藏）、审批卡、导航建议卡、空态 |
| `ai-permission-config.tsx` | 331 | 权限三档 + 工具勾选（名单取自 `AI_TOOLS`）；`settings` / `panel` 两形态。三档各有 tooltip 说明、分组说明挂在标题的 Info 图标上（不常显） |
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

### 4.5 设置页（1 个文件）

`settings/AI.tsx`(825)：通用设置 + AI 权限两张卡片 + 5 个预览组件。
（`-features/ai/components/provider-card.tsx`、`ai-model-card.tsx`、`ai-provider-export-dialog.tsx`、
`ai-provider-import-dialog.tsx` **已删除**。）

### 4.6 Store（1 个）

`lib/store/preferences-store.ts`(721，AI 字段见 §3.6)。
（原 `lib/store/ai-store.ts`(346，`admin.ai`) **已删除**。）

### 4.7 i18n

- `messages/ai/*.json`：7 语言各 **121 个叶键**（95 个顶层键 = 90 直接键 + 5 分组：
  `tools` 15 / `sessionGroups` 5 / `greetings` 3 / `toolDetail` 3 / `taskCard` 5）。
  **7 语言键集合完全一致**（`pnpm guardrails` 全量校验）。
  （模型相关的 `selectModel` / `modelNone` / `modelEmpty` / `goToSettings` / `visionUnsupported` /
  `reasoning` 已删；`aiSettings` / `reasoningTitle` / `reasoningThinking` 仍在用。）
- `common` 命名空间 `profile.settings.ai*`（通用设置 / 枚举项 / 权限）；**厂商模型与导入导出的
  66 个直接键（含分组展开共 74 个叶键）已随本次清理删除**（7 语言一致）；
  入口名 `profileNav.ai` / `askAi`（「Ask AI」是产品名，各语言保留原文；`aiModes.split/float` 必须本地化）。
- AI 引用的 `nav.*` 只有 `nav.userDetail`（`@` 引用的详情页名字）。

### 4.8 脚本、依赖、门控

- 生成：`packages/api-client/scripts/gen-endpoint-specs.js`（读同包 `openapi.json` →
  `packages/api-client/src/endpoint-specs.gen.ts`，**不要手改**；由 `pnpm api` 编排）；
  产物当前 **7.5 KB / 25 条**，应用侧经 `@admin/api-client/endpoint-specs` 子路径懒加载。
- `packages/api-client/scripts/gen-query-params.js`（`USER_FILTER_FIELDS` 等编译期查询参数）。
- 门控：`scripts/ai/check-guardrails.mjs`（`pnpm guardrails`：i18n 键树全量一致 + diff 内禁用样式）。
- 依赖：`ai@^7.0.116`、`@ai-sdk/anthropic@^4.0.65`（**仍待移除**）、`@ai-sdk/openai@^4.0.77`（**仍待移除**）、
  `@ai-sdk/openai-compatible@^3.0.57`、`bot-avatars@^0.1.1`、`border-beam@^1.4.1`、
  `react-markdown@^10.1.0`、`remark-gfm@^4.0.1`、`motion@^13.4.4`。
- 被 `#/features/ai/core` 引用的**非内部文件共 23 个**：11 个 AI 组件、7 个 sphere 文件、
  `app-shell.tsx`、`use-table-query.ts`、`features/ai/page/{use-feature,types,convert,registry}.ts`、
  业务表单页 5 个。`AI_TOOLS` 与 `sendAiMessage` 各只有**一个**消费点。

---

## 5. 现状与文档 / 代码不一致（待修）

以下为盘点时发现的事实差异，**未改代码**。前 3 条是文档滞后，后 4 条是代码层面待确认项。

| # | 位置 | 现象 | 建议 |
|---|---|---|---|
| 1 | `ai-architecture.md` §5 | ~~写「工具定义 10 个工具（无表单时 7 个）」~~ **已修复**：改为「Router 只发 `select_tools`；Execution 只发选中的工具（候选 **18 个**，无表单时 14 个）」 | — |
| 2 | `ai-architecture.md` §1 / §3 | §1 的 L5 只列 4 个工具文件（实际 8 个）；§3 的审批表格未覆盖 `open_form` / `run_page_command` / `manage_tasks` / `request_permission` | 按本文 §3.2 / §3.3 同步 |
| 3 | `ai-architecture.md` §4 / §5、`features/ai/core/endpoint-specs.ts` 注释 | 写「接口参数索引 363 KB / gzip 23.6 KB」「全局接口清单 600+ 条」，实际 `endpoint-specs.gen.ts` **7.5 KB / 25 条**；生成脚本已从 `apps/web/scripts/` 迁到 `packages/api-client/scripts/` | 更新量级与路径 |
| 4 | `features/ai/core/chat.ts:159` | 使用 `AiStreamEvent` 但**顶部没有 import 它**（`import type` 列表缺一项）→ `tsc --noEmit` 会报 `Cannot find name` | 补一个 `import type` 即可（用 `verify` skill 确认） |
| 5 | ~~`features/ai/core/tools/form-tools.ts` 的 `?? (ctx.mode === 'ask' \|\| true)`~~ | **已修复（2026-10）**：审批判定收口到 `features/ai/core/approval-policy.ts` 的策略表，`submit_form` 不再恒真；同时发现并修掉批量计划的两处模式泄漏（纯只读计划在 auto 下弹卡、子步骤重复弹读授权） | — |
| 6 | `features/ai/core/route-refs.ts:276` | `expandRouteRefs` 追加的说明**硬编码面板策略**（「必须优先 `navigate_to` … 配合 `update_search_params` … 切勿直接调用只读接口」），与 §8.1「策略由提示词按容器给、工具描述保持容器中立」冲突；**全屏容器**里 `update_search_params` 根本不下发，模型会被引向一个不存在的工具 | 改为容器中立的表述（或按 `surface` 分策略，与 `workflow.ts` 同源） |
| 7 | i18n | ~~`common:profile.settings.aiToolNames.*` 只覆盖 10 / 16 个工具…权限界面与工具卡片会显示英文蛇形原名~~ **已修复**：`AI_TOOLS` 现有 **18** 个工具，zh-CN 的 `aiToolNames.*` 与 `ai:tools.*` **各 18 / 18 全齐**；另补了权限三档的 tooltip 说明（`aiPermissionModeHints.*`）、删掉了常显的 `aiToolListHint` | 只剩流水线：跑 `pnpm i18n` 把新增键补到其它 6 语言（铁律 1） |

---

> 更新本文的时机：**新增 / 删除工具、加一层提示词、加一个 AI 设置项、加一个 AI 文件**。
> 叙述与理由仍以 [`ai-architecture.md`](./ai-architecture.md) 为准 —— 本文只保证「清单不缺项」。

---

## 6. 这一版新增/改造的能力（2026-10）

> 本节只记"哪些是新东西、落在哪个文件"，细节以对应文件的注释与
> [ai-architecture.md](./ai-architecture.md) 为准。

### 6.1 AI 能力矩阵（权限粒度）

- 旧模型：三档 + 一份**工具名**勾选清单（用户看到的是 `call_write_api` 这类实现名）。
- 新模型：**行 = 能力、列 = 动作**的矩阵，每个格子可独立授权：
  ```
  页面   读取 · 跳转 · 操作
  数据   查询 · 修改
  表单   读取 · 更新 · 提交
  任务   编排 · 授权
  ```
- 唯一真值 `features/ai/core/capabilities.ts`；工具用 `capability: 'page:read'` 声明自己在哪一格；
  偏好字段由 `aiAllowedTools`（工具名）改为 `aiCapabilities`（格子键）。
- 权限界面（`features/ai/components/permission-config.tsx`）随之改为**一行一个能力、行内多权限**
  （每行一个 `Checkbox.Group`，标题走行名 + tooltip）。
- **「打开表单」算哪一格**：算 `form:update`（更新）—— 打开表单的唯一目的就是改数据；
  只看不改的路径是详情页，不是表单。`open_form` / `fill_form` 都落在 `form:update`。

### 6.2 AI 自主 Todo 编排（后端无批量接口时的正道）

- `manage_tasks` 的每个 task 可带 `action: { tool, input }`：模型一次给全整组步骤。
- 执行：在**一次**工具调用内部**顺序**跑完（`for ... await`，前一步完成才做下一步），
  中途不返回模型；执行前**整批确认一次**（用户看到完整步骤清单）。
- 结果：`outcomes`（逐步 id / 成败 / 结果 / 错误）一次性回传给模型 → 模型写总结。
- 进度：`ctx.reportTaskProgress` 逐步上报，输入区的任务卡实时推进（`liveTasks`）。
- 安全：`ctx.resolveTool` 只认本轮已授权的工具 —— 防模型借 `manage_tasks` 提权。
- **坑（务必记住）**：`task-tools` 不能 import `tools/index`（循环 import 会让
  `AI_TOOLS` 里混进 `undefined`）。工具集必须由 `ctx` 注入。

### 6.3 基础工具与页面检索

| 工具 | 干什么 | 为什么 |
|---|---|---|
| `get_current_time` | 浏览器的时间事实（UTC 绝对时刻 + 操作系统时区 + 用户展示时区 + 秒级时间戳 + 星期 + 今天日期） | 模型不知道"现在"；相对时间查询必须换算成精确时间戳 |
| `reload_page_data` | 让页面按自己的语义重新取数 | 把"AI 手里的数据"对齐到"屏幕上此刻的数据" |
| `search_pages` | 按功能描述**模糊检索页面目录**（标题 + 一句话 desc + 接口清单） | 页面明细不再全量下发；检索命中后再取明细 |

### 6.4 跨页面数据聚合

- `search_pages` 返回每页的**接口清单**（method + path + 用途），`get_page_context` 接受
  `path` 参数读**指定页面**（不必跳过去）—— 两者配合就能"自己把相关页面的数据取全再汇总"。
- 页面必须有 `desc` 才能被检索到：登记在 `features/ai/core/page-catalog.ts` 的 `AI_PAGE_CATALOG`。

### 6.5 示例路由：工单管理（`/example/tickets`）

- **mock 刻意只提供单条接口**（`GET/POST/PUT /ticket`、`DELETE /ticket/{id}`、
  `PATCH /ticket/{id}/status`），**没有** `/ticket/batch-delete`。
- 用途：验收 AI 的编排能力 —— 批量操作时它应当用 `manage_tasks` 编排 N 次单条调用，
  而不是循环调用（那样每条一次模型往返）。
- 页面侧也**不提供批量按钮**、`feature.ts` 里**不声明批量指令**（后端没有的能力不要声明，
  否则 AI 会以为有捷径）。

### 6.6 AI 核心聚合到 `src/features/ai/`（2026-10）

搬迁前 AI 的东西散在**六处**，想知道「AI 一共有什么」得先记住这些位置：

| 原来 | 现在 | 内容 |
|---|---|---|
| `lib/ai/**`（40 文件） | `features/ai/core/**` | 会话 / 运行时 / 工具 / 上下文 / 权限 / 审批 |
| `components/ai-*.tsx`（11 个） | `features/ai/components/*.tsx` | 面板 / 输入区 / 会话列表 / 权限配置… |
| `components/markdown-*` + `lib/pretext` | `features/ai/markdown/**` | 助手回复的 Markdown 与流式排版引擎 |
| `features/sphere/**` | `features/ai/sphere/**` | 全屏对话页 |
| `lib/features/**` | `features/ai/page/**` | 页面声明框架（`defineFeature` / `useFeature`） |

**两条边界**（搬迁后依然成立，见 `features/ai/index.ts` 与 README）：

1. **业务页只从 `#/features/ai/page` 导入** —— 根 barrel 会把面板与会话 store 拖进页面 chunk。
   `page/` 是刻意保留的公开面（被 28 个业务文件引用）。
2. **`core/runtime` 不从任何 barrel 导出** —— 它 import 了 AI SDK（几百 KB），
   靠 `core/chat.ts` 的动态 `import('./runtime')` 按需加载。约定原样继承，别在 barrel 里补全。

> 搬迁用的是 `git mv`（保留历史），只改了 import 路径与注释里的路径引用，
> **未改动任何逻辑** —— `typecheck` 错误数与搬迁前逐条相同、21 个工具与能力矩阵行为实测一致。
