# @admin/ai-prompt

AI 系统提示词的**唯一真值** —— 七层分层装配，纯函数，**零运行时依赖**。

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

## 七层（顺序即优先级，`PROMPT_LAYERS` 是唯一真值）

| # | 层 | 回答的问题 |
|---|---|---|
| L1 | `layers/identity.ts` | 你是谁、为谁服务 |
| L2 | `layers/scope.ts` | **什么该答、什么该拒**（范围闸） |
| L3 | `layers/capability.ts` | 手上有什么、要不要先问（**绝不复述权限**） |
| L4 | `layers/workflow.ts` | 业务内请求怎么做（**按容器分策略**） |
| L5 | `layers/output.ts` | 怎么说话、用什么语言 |
| L6 | `src/index.ts` | 我在哪（页面上下文） |
| L7 | `layers/workflow.ts` | 这轮在续做什么（任务清单） |

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
