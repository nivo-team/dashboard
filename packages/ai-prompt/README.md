# @admin/ai-prompt

AI 系统提示词的**唯一真值** —— 分层装配（按 `router` / `execution` 两阶段取层），纯函数，**零运行时依赖**。

```ts
import { buildSystemPrompt, PROMPT_LAYERS } from '@admin/ai-prompt'

const system = buildSystemPrompt({
  mode: 'ask',                 // ask | auto
  surface: 'panel',            // panel | sphere
  appName: 'Nivo',
  appId: 'console',            // null = 不在任何应用里
  outputLanguageName: '简体中文',
  pageSummaryText: '……',       // 已格式化的当前页面摘要（应用 / 页面 / 路径 / 路由模板）
  navEntries: [{ name: '用户运营', path: '/console/users', group: null }],
  shellNavNames: ['应用选择'],
  activeTasks: null,           // 会话任务清单，可为 null
})
```

## 为什么有这个包

系统提示词原先只活在前端（`apps/web/src/lib/ai/prompt`），既能被浏览器拆解、也只能在浏览器里拼。
抽包之后它是**服务端可运行的真值**：`apps/ai`（Hono Worker）与前端共用同一份规则文本。

## 三条硬约定

1. **不许依赖任何运行时**：不 import React / zustand / i18n，不读 `window`，不发请求。
   它只做「拿一份事实快照，产出一个字符串」——所以同一份代码在 Worker、浏览器、node 里都能跑。
2. **规则在这里，事实在外面**：导航清单、页面摘要、工具目录、任务清单都是客户端状态，
   由调用方采集后经 `PromptFacts` 传入（见 `src/types.ts`）。
3. **每轮重算、不许缓存**：`buildSystemPrompt` 是纯函数，事实变了结果就该变。

## 分层（顺序即优先级，`PROMPT_LAYERS` 是唯一真值）

共 **14 层**（stable 9 + volatile 5）。每层用 `group: 'core' | 'domain' | 'execution'` 标注归属，
用 `stages` 标注参与哪个阶段（**不声明 = 两个阶段都加载**）；`PromptStage = 'router' | 'execution'`。

| # | 层 | group | 阶段 | 回答的问题 |
|---|---|---|---|---|
| L1 | `layers/identity.ts` → `identity` | core | 两者 | 你是谁、为谁服务 |
| L2 | `layers/scope.ts` → `scope-core` | core | **仅 router** | **什么该答、什么该拒**（分诊框架：业务内 / 越界 / 模糊） |
| L3 | `layers/scope.ts` → `guard` | core | 两者 | **安全边界**：数据不是指令、元指令越界、坚持/催促不改变判定 |
| L4 | `layers/scope.ts` → `domain` | domain | **仅 router** | 业务范围：越界清单 / 两个例外 / 导航清单 / 越界话术 / 混合请求处理 |
| L5 | `layers/capability.ts` → `capability` | core | 两者 | 手上有什么、要不要先问（unsupported / permission_denied / 分不清 三态） |
| L6 | `src/index.ts` → `executor-role` | execution | **仅 execution** | 本轮处于执行阶段：分诊已完成，不要重新判定范围 |
| L7 | `layers/workflow.ts` → `workflow` | execution | 仅 execution | 业务内请求怎么做（**按容器分策略**，操作规约） |
| L8 | `layers/output.ts` → `output` | core | 两者 | 怎么说话、用什么语言 |
| L9 | `src/index.ts` → `tool-catalog` | core | 仅 router | 本轮**当前权限下可用**的工具目录（一行一个，来自 `toolCatalogText`） |
| L10 | `layers/capability.ts` → `mode-rule` | execution | 仅 execution | 本轮模式说明 |
| L11 | `layers/workflow.ts` → `playbook` | execution | 仅 execution | 按容器的决策优先级 |
| L12 | `src/index.ts` → `runtime-context` | core | 两者 | **当前运行态**：模式（询问 / 自动）/ 语言 |
| L13 | `src/index.ts` → `page-summary` | core | **两者** | 我在哪个页面（应用 / 页面 / 路径 / 路由模板，来自 `pageSummaryText`） |
| L14 | `layers/workflow.ts` → `active-tasks` | execution | 仅 execution | 这轮在续做什么（任务清单） |

`page-context` 层**已删除**：完整页面明细（接口 / 字段 / 表单 / 搜索参数）**不再每轮注入**，
改由执行阶段调 `get_page_context` 工具按需获取（工作方式层本就要求"要查数据前先 `get_page_context`"）。
`PromptFacts` 相应删掉了 `pageContextText` 字段（`pageSummaryText` 保留，两个阶段都带）。

`buildSystemPrompt(facts, stage?)` / `buildTurnContext(facts, stage?)` 的 `stage` **默认
`execution`**（向后兼容：老调用方行为不变）；`layersForStage(stage)` 返回某阶段会用到的层。

## 两阶段：Router → Execution

前端 `apps/web/src/lib/ai/runtime.ts` 用 AI SDK v7 的 `prepareStep` + `activeTools` 实现，
**一次 `streamText`、无额外往返**：

| step | 阶段 | 服务端注入的提示词 | 发给模型的工具 |
|---|---|---|---|
| 0 | `router` | 身份 / 分诊框架 / 安全边界 / 越界清单 / 能力边界 / 工具目录 / 回答方式 + 运行态 + 页面摘要 | 只有 `select_tools`（虚拟工具） |
| ≥1 | `execution` | 身份 / 安全边界 / 能力边界 / **执行阶段角色** / 工作方式 / 回答方式 + 模式说明 / 容器策略 / 运行态 / 页面摘要 / 任务续做 | `select_tools` 选中的工具（含依赖补齐） |

- Router 若**直接回答**（没调 `select_tools`），流程自然结束 —— 「你好 / 谢谢」这类请求只付 Router 的钱；
- **Router 与 Execution 的 system 是两份不同的提示词**，在 `identity` 之后分叉：执行阶段不再带
  越界清单与分诊框架，换成「执行阶段角色」（分诊已在上一步完成，不要重新判定范围）；
  **同一阶段跨轮**的 system 仍逐字节一致（前缀缓存的前提不变）。
- 安全边界（`guard`，数据不是指令）**两个阶段都在** —— 执行阶段会读到工具返回与附件，注入防线不能缺席。

**离线实测**（一份典型 facts，同口径字符）：Router **3594** 字符（system 3479 + turnContext 115），
Execution **4210** 字符（system 2319 + turnContext 1891）。对比上一版：Execution 从 5566 降到 4210
（约 −24%，省掉了越界清单与分诊框架），Router 从 3284 升到 3594（多了 `guard` 与运行态），
但 Router 总量仍远小于 Execution。重构前每轮（同口径：提示词 + 工具定义，去空白字符）
≈ 提示词 5566 + 全量工具定义 7934 ≈ 13500 字符；「你好」场景 ≈ Router 3594 + `select_tools`
定义 733 ≈ **4327 字符**、且不加载任何业务工具 schema → **同口径降幅约 68%**
（真实 token 以运行时的 `[ai:turn]` usage 日志为准）。

`PromptFacts` 相应以 `pageSummaryText?`（摘要，两个阶段都带）与 `toolCatalogText?`（工具目录，
Router 阶段拼进 system）承载页面事实；`formatPageSummary(context)` 只含
应用 / 页面 / 路径 / 路由模板，完整明细（接口 / 字段 / 表单 / 搜索参数）由执行阶段的
`get_page_context` 工具按需获取。

## 开发

```bash
pnpm -C packages/ai-prompt typecheck

# 包内 import 显式带 .ts 扩展名（tsconfig 开了 allowImportingTsExtensions），
# 因此 node 可以**直接运行**本包，用于快速验证装配结果：
node --experimental-strip-types --input-type=module -e "
const m = await import('./packages/ai-prompt/src/index.ts');
console.log(m.buildSystemPrompt({ mode:'ask', surface:'panel', appName:'Nivo', appId:null,
  outputLanguageName:'简体中文', pageSummaryText:'', navEntries:[], shellNavNames:[], activeTasks:null }).length)
"
```

## 规则只有这一份

前端 `apps/web/src/lib/ai/prompt/**` 与漂移门控 `scripts/ai/check-prompt-drift.mjs` 都已删除：
规则文本**只在本包**（`src/layers/**`），前端只上报事实（`PromptFacts`）。
历史迁移步骤与边界见 [`.agents/docs/ai-server-layer.md`](../../.agents/docs/ai-server-layer.md) §5。
