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
  pageContextText: '……',       // 已格式化的当前页面上下文
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
2. **规则在这里，事实在外面**：导航清单、页面上下文、任务清单都是客户端状态，
   由调用方采集后经 `PromptFacts` 传入（见 `src/types.ts`）。
3. **每轮重算、不许缓存**：`buildSystemPrompt` 是纯函数，事实变了结果就该变。

## 分层（顺序即优先级，`PROMPT_LAYERS` 是唯一真值）

每层用 `group: 'core' | 'domain' | 'execution'` 标注归属，用 `stages` 标注参与哪个阶段
（**不声明 = 两个阶段都加载**）；`PromptStage = 'router' | 'execution'`。

| # | 层 | 阶段 | 回答的问题 |
|---|---|---|---|
| L1 | `layers/identity.ts` | 两者 | 你是谁、为谁服务 |
| L2 | `layers/scope.ts` → `scope-core` | 两者 | **什么该答、什么该拒**（分诊框架） |
| L2' | `layers/scope.ts` → `domain` | 两者 | 业务范围：越界清单 / 例外 / 导航清单 / 不变通 |
| L3 | `layers/capability.ts` | 两者 | 手上有什么、要不要先问（**绝不复述权限**） |
| L4 | `layers/workflow.ts` → `workflow` | `execution` | 业务内请求怎么做（**按容器分策略**，操作规约） |
| L5 | `layers/output.ts` | 两者 | 怎么说话、用什么语言 |
| L6 | `src/index.ts` → `tool-catalog` | `router` | 本轮**当前权限下可用**的工具目录（一行一个，来自 `toolCatalogText`） |
| L6' | `src/index.ts` → `page-summary` | `router` | 我在哪个页面（应用 / 页面 / 路径 / 路由模板，来自 `pageSummaryText`） |
| L7 | `src/index.ts` → `page-context` | `execution` | 我在哪（完整页面上下文：接口 / 字段 / 表单 / 搜索参数） |
| L7' | `layers/workflow.ts` → `active-tasks` | `execution` | 这轮在续做什么（任务清单） |

`buildSystemPrompt(facts, stage?)` / `buildTurnContext(facts, stage?)` 的 `stage` **默认
`execution`**（向后兼容：老调用方行为不变）；`layersForStage(stage)` 返回某阶段会用到的层。

## 两阶段：Router → Execution

前端 `apps/web/src/lib/ai/runtime.ts` 用 AI SDK v7 的 `prepareStep` + `activeTools` 实现，
**一次 `streamText`、无额外往返**：

| step | 阶段 | 服务端注入的提示词 | 发给模型的工具 |
|---|---|---|---|
| 0 | `router` | 身份 / 分诊框架 / 业务范围 / 能力边界 / 回答方式 + **工具目录** + 页面摘要 | 只有 `select_tools`（虚拟工具） |
| ≥1 | `execution` | 上面那些 + 操作规约（工作方式 / 容器策略 / 模式说明 / 任务续做）+ 完整页面上下文 | `select_tools` 选中的工具（含依赖补齐） |

- Router 若**直接回答**（没调 `select_tools`），流程自然结束 —— 「你好 / 谢谢」这类请求只付 Router 的钱；
- `execution` 阶段的 system 与 turnContext 与重构前**逐字节一致**（已脚本对三个场景验证），
  所以规则一条没丢、前缀缓存不受影响；
- 两阶段的拼接共享同一段前缀：`router` 的结果是 `execution` 去掉 execution 层后的**子序列**。

**离线实测**（一份典型 facts）：Router **3194** 字符（system 3115 + turnContext 79），
Execution **5566** 字符（system 3652 + turnContext 1914）；重构前每轮 ≈ 提示词 5566
\+ 全量工具 schema 17213 ≈ 22779 字符，「你好」场景降到 3194 且无业务工具 schema → **降幅约 86%**。

`PromptFacts` 相应新增 `pageSummaryText?`（Router 用摘要）与 `toolCatalogText?`（工具目录）；
`formatPageSummary(context)` 只含 应用 / 页面 / 路径 / 路由模板，`formatPageContext(context)`
才含接口 / 字段 / 表单 / 搜索参数明细。

## 开发

```bash
pnpm -C packages/ai-prompt typecheck

# 包内 import 显式带 .ts 扩展名（tsconfig 开了 allowImportingTsExtensions），
# 因此 node 可以**直接运行**本包，用于快速验证装配结果：
node --experimental-strip-types --input-type=module -e "
const m = await import('./packages/ai-prompt/src/index.ts');
console.log(m.buildSystemPrompt({ mode:'ask', surface:'panel', appName:'Nivo', appId:null,
  outputLanguageName:'简体中文', pageContextText:'', navEntries:[], shellNavNames:[], activeTasks:null }).length)
"
```

## 规则只有这一份

前端 `apps/web/src/lib/ai/prompt/**` 与漂移门控 `scripts/ai/check-prompt-drift.mjs` 都已删除：
规则文本**只在本包**（`src/layers/**`），前端只上报事实（`PromptFacts`）。
历史迁移步骤与边界见 [`.agents/docs/ai-server-layer.md`](../../.agents/docs/ai-server-layer.md) §5。
