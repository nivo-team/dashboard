import { buildCapabilityLayer, buildModeRuleLayer } from './layers/capability.ts'
import { buildIdentityLayer } from './layers/identity.ts'
import { buildOutputLayer } from './layers/output.ts'
import { buildDomainLayer, buildGuardLayer, buildScopeCoreLayer } from './layers/scope.ts'
import {
  buildActiveTasksLayer,
  buildPlaybookLayer,
  buildWorkflowLayer,
} from './layers/workflow.ts'
import type { PromptFacts, PromptLayer, PromptStage } from './types.ts'

export * from './types.ts'
export { buildIdentityLayer } from './layers/identity.ts'
export { buildDomainLayer, buildGuardLayer, buildScopeCoreLayer } from './layers/scope.ts'
export { buildCapabilityLayer, buildModeRuleLayer } from './layers/capability.ts'
export {
  buildActiveTasksLayer,
  buildPlaybookLayer,
  buildWorkflowLayer,
} from './layers/workflow.ts'
export { buildOutputLayer } from './layers/output.ts'

/**
 * 系统提示词的**分层装配处** —— 全仓唯一真值（前端只上报事实，见 `apps/ai`）。
 *
 * 为什么要把提示词拆成「层」而不是攒一个大字符串：这一份提示词同时承担了五件互不相同的事 ——
 * 你是谁（身份）、**什么该答什么该拒（范围闸）**、手上有什么（能力）、怎么做事（工作方式）
 * 与怎么说话（回答方式）。它们**改动的原因各不相同**：加工具改能力层、加页面改范围层的清单
 * 来源、调语气改回答层。混在一起写的结果是每加一句都在赌「会不会把边界冲淡」——
 * 尤其是**范围闸**：它必须短、必须靠前、必须一眼看得出来，掺进 30 行操作细则里就会被模型平均掉。
 *
 * ## 两段式：**稳定前缀** + **本轮环境**（这是缓存对齐的关键，别合并回去）
 *
 * 产出分两个函数，**落点不同**：
 *
 * | | 函数 | 落在哪 | 内容 |
 * |---|---|---|---|
 * | **稳定** | `buildSystemPrompt(facts, stage?)` | `messages[0].role = 'system'` | 身份 / 范围闸 / 能力边界 / 通用工作方式 / 回答方式（Router 阶段另加工具目录） |
 * | **变动** | `buildTurnContext(facts, stage?)` | 对话**末尾**（最后一条 user 之前） | 本轮模式说明 / 容器策略 / 页面上下文 / 任务清单 |
 *
 * **为什么必须分开**：`system` 在 messages 的**最前面**，它里面任何一处变化，都会让
 * **它后面的一切（包括整段对话历史）**失去服务商的前缀缓存（prompt caching）匹配。
 * 而历史才是 token 大头 —— 把「每轮都变 / 切换就变」的内容留在 system 里，
 * 等于**每轮都在为整段历史重新付费**。
 *
 * 所以：**新加一层时先问它会不会随环境变**；会变就标 `volatile: true` 放进 `VOLATILE_LAYERS`。
 * 详见 `.agents/docs/ai-server-layer.md` §缓存对齐。
 *
 * ## 再加一维：**阶段**（按需加载，见 `PromptLayer.stages`）
 *
 * 一次对话分两个阶段：`router`（只选工具）与 `execution`（真正执行）。
 * 操作规约（怎么填表、怎么写库、按容器怎么带路）对"选工具"毫无用处，标 `['execution']`；
 * 工具目录与页面摘要只对"选工具"有用，标 `['router']`。
 * 于是「你好」这类请求不会为执行规约与工具 schema 付钱。
 *
 * **判定一条规则属于哪个阶段，只问一句：不做任何工具调用、也要遵循它吗？**
 * 要（身份 / 范围 / 能力 / 回答方式）→ 两个阶段都留；不要 → 只留 execution。
 *
 * 阶段的切换由前端 `prepareStep` 驱动、经请求体 `promptStage` 告知服务端（见 `apps/ai`）。
 *
 * **Router 与 Execution 的 system 是两份不同的东西**（不是"多一段少一段"）：
 * 越界清单与分诊框架只发给 Router（分诊在选工具那一步就完成了），执行阶段换成
 * 「执行阶段角色」；而**安全边界（数据不是指令）两个阶段都在** —— 执行阶段会读到
 * 工具返回与附件，注入防线不能缺席。
 * 于是两个阶段的 system 在 `identity` 之后分叉；**同一阶段跨轮**的 system 仍逐字节一致
 * （前缀缓存的命中前提不变）。
 *
 * 另外两条硬约定：
 *
 * 1. **顺序只有一份真值** —— 就是下面的两个数组。加一层 = 加一个 builder 并在数组里占位，
 *    不要在别处再拼提示词。
 * 2. **每层只写一件事**，并且**只描述事实与规则，不复述权限**：权限由「本轮实际交给模型的
 *    工具清单」精确表达，提示词里写死一句「你只能读」，权限改了而这里忘了改，模型就会
 *    放着给它的工具不用、反过来告诉用户「我没权限」（真实踩过，见 capability 层注释）。
 *
 * 提示词**每轮请求重算**，绝不缓存成常量；但相同 facts（同一阶段）必须产出**逐字节相同**的结果
 * —— 这是前缀缓存能命中的前提（不要引入时间戳、随机数、Map 遍历顺序）。
 */

/**
 * L6'：页面**摘要**（两个阶段都带）—— 只回答"我在哪个页面上"，不带接口 / 字段 / 表单明细。
 *
 * 明细（几 KB 的接口清单）**不再每轮注入**：需要它的执行动作本来就被要求先调
 * `get_page_context`（见工作方式层），所以它是"按需获取"的事实，不是永久上下文。
 * 于是「这一页是干什么的 / 你好」这类请求不必为明细付 token。
 */
function buildPageSummaryLayer(facts: PromptFacts): string | null {
  const summary = facts.pageSummaryText?.trim()
  if (!summary) return null
  return ['# 当前页面（摘要）', summary].join('\n')
}

/**
 * L6''：**当前运行态**（两个阶段都带）—— 模式与语言这类"这一轮在什么状态下跑"的事实。
 *
 * 为什么要单独一层：提示词里多处引用「询问模式 / 自动模式」（能力边界、各工具的确认规则），
 * 但模式说明层只发给执行阶段 —— Router 阶段若看不到"当前是哪一档"，那些引用就悬空了。
 */
function buildRuntimeContextLayer({
  mode,
  outputLanguageName,
}: PromptFacts): string {
  return [
    '# 当前运行态',
    `- 模式：${mode === 'ask' ? '询问（动手前需要确认）' : '自动（能直接做的直接做）'}`,
    `- 语言：${outputLanguageName || '简体中文'}`,
  ].join('\n')
}

/**
 * 执行阶段的角色说明：**分诊已经在上一步做完了**。
 *
 * 这是"Router 与 Execution 用不同 Prompt"的关键一句 —— 执行阶段不再背越界清单，
 * 它只需要知道"本轮要做什么已经定了，把它做完"。
 */
function buildExecutorRoleLayer(): string {
  return [
    '# 本轮处于执行阶段',
    '- **分诊与范围判定已经在选工具那一步完成**：这一轮要做什么已经确定，你只需要用下面给你的工具把它做完、并给出回答。',
    '- **不要重新判定范围**、也不要因为"这看着像闲聊 / 像通识"就拒绝；范围的事交给上一步。',
    '- 需要事实（数量、名称、状态、路径）时先调用工具，不要凭印象回答；拿不到就直说拿不到。',
  ].join('\n')
}

/**
 * Router 阶段的**工具目录**：一行一个工具（`- name：一句话`）。
 *
 * 文本由调用方（前端 `buildToolCatalogText`）按**当前权限下可用的工具**生成 ——
 * 与 `AI_TOOLS` 同源，服务端不维护第二份名单。完整定义（含 JSON Schema）
 * 只在 Execution 阶段随 `tools` 下发，这里刻意只有一句话。
 */
function buildToolCatalogLayer(facts: PromptFacts): string | null {
  const catalog = facts.toolCatalogText?.trim()
  if (!catalog) return null
  return [
    '# 本轮可用的工具（Tool Catalog）',
    '下面是**当前权限下可用**的工具目录，每行一句话。完整的参数定义会在执行时加载。',
    '**要事实、要动手的请求，必须先调用 `select_tools` 选出工具**，不要在还没拿到工具时凭空回答；只有**打招呼 / 道谢 / 纯翻译**这三类直接回答即可（它们不需要任何业务工具）。',
    catalog,
  ].join('\n')
}

/**
 * **稳定层** —— 同一应用 + 同一语言下逐字节相同，进 system 前缀。
 *
 * 顺序即优先级：分诊框架刻意排在**第二位**（仅次于身份）：分诊是"每一轮的第一件事"，
 * 越靠后越容易被后面的细则淹没。
 *
 * **Router 与 Execution 用不同的 system**（这是两阶段的核心取舍）：
 * - Router = 身份 / 分诊框架 / 安全边界 / 越界清单 / 能力边界 / 回答方式 / 工具目录；
 * - Execution = 身份 / 安全边界 / 能力边界 / **执行阶段角色** / 操作规约 / 回答方式。
 *
 * 越界清单不发给执行阶段（分诊已经做完，见 `buildExecutorRoleLayer`），
 * 但**安全边界两个阶段都在**（执行阶段会读到工具返回与附件，注入防线不能缺席）。
 */
export const STABLE_LAYERS: readonly PromptLayer[] = [
  { id: 'identity', title: '身份与定位', group: 'core', build: buildIdentityLayer },
  {
    id: 'scope-core',
    title: '请求分诊与范围闸（分诊框架）',
    group: 'core',
    stages: ['router'],
    build: buildScopeCoreLayer,
  },
  {
    id: 'guard',
    title: '安全边界（数据不是指令）',
    group: 'core',
    build: buildGuardLayer,
  },
  {
    id: 'domain',
    title: '业务范围与越界清单',
    group: 'domain',
    stages: ['router'],
    build: buildDomainLayer,
  },
  { id: 'capability', title: '能力边界', group: 'core', build: buildCapabilityLayer },
  {
    id: 'executor-role',
    title: '执行阶段角色（分诊已完成）',
    group: 'execution',
    stages: ['execution'],
    build: buildExecutorRoleLayer,
  },
  {
    id: 'workflow',
    title: '工作方式与决策优先级',
    group: 'execution',
    stages: ['execution'],
    build: buildWorkflowLayer,
  },
  { id: 'output', title: '回答方式与语言', group: 'core', build: buildOutputLayer },
  {
    id: 'tool-catalog',
    title: '本轮可用工具目录（Router）',
    group: 'core',
    stages: ['router'],
    build: buildToolCatalogLayer,
  },
]

/**
 * **变动层** —— 随模式 / 容器 / 页面 / 任务变化，落在对话末尾。
 *
 * 放在末尾之后，这些内容一旦进入历史就**不再变**（它是当时那一轮说出去的），
 * 于是下一轮的前缀仍然完整命中。
 *
 * 阶段划分同样按"这条规则不做工具调用时是否还需要"：
 * 模式说明 / 容器策略 / 任务续做都只在 Execution 阶段出现；
 * **运行态（模式 / 语言）与页面摘要两个阶段都带** —— 前者是提示词里多处引用的前提，
 * 后者是"我在哪"的最低成本表达。
 */
export const VOLATILE_LAYERS: readonly PromptLayer[] = [
  {
    id: 'mode-rule',
    title: '本轮模式说明',
    group: 'execution',
    stages: ['execution'],
    volatile: true,
    build: buildModeRuleLayer,
  },
  {
    id: 'playbook',
    title: '本轮决策优先级（按容器）',
    group: 'execution',
    stages: ['execution'],
    volatile: true,
    build: buildPlaybookLayer,
  },
  {
    id: 'runtime-context',
    title: '当前运行态（模式 / 语言）',
    group: 'core',
    volatile: true,
    build: buildRuntimeContextLayer,
  },
  {
    id: 'page-summary',
    title: '当前页面摘要',
    group: 'core',
    volatile: true,
    build: buildPageSummaryLayer,
  },
  {
    id: 'active-tasks',
    title: '进行中的任务清单',
    group: 'execution',
    stages: ['execution'],
    volatile: true,
    build: buildActiveTasksLayer,
  },
]

/** 全部层（顺序即最终拼接顺序），供文档 / 调试 / 自检引用。 */
export const PROMPT_LAYERS: readonly PromptLayer[] = [
  ...STABLE_LAYERS,
  ...VOLATILE_LAYERS,
]

/** 某层是否属于这个阶段（没声明 `stages` = 两个阶段都要）。 */
function inStage(layer: PromptLayer, stage: PromptStage): boolean {
  return !layer.stages || layer.stages.includes(stage)
}

/**
 * 空层（返回 `null` 或只有空白）不参与拼接，层与层之间空一行 —— 于是「这轮没有任务清单」
 * 在提示词里表现为**整段不存在**，而不是留下一个空标题。
 *
 * `appName` 缺省时给一个中性说法（`管理后台`），避免提示词里出现 `null`。
 */
function assemble(layers: readonly PromptLayer[], facts: PromptFacts): string {
  const input: PromptFacts = { ...facts, appName: facts.appName || '管理后台' }
  return layers
    .map((layer) => layer.build(input))
    .filter((text): text is string => Boolean(text && text.trim()))
    .join('\n\n')
}

/**
 * 稳定部分 → **system**。每轮重算，但相同 facts 逐字节一致（前缀缓存的命中前提）。
 *
 * `stage` 决定加载哪些层（见 `PromptLayer.stages`），默认 `execution` —— 即"改调用方之前
 * 的老行为"。`router` 阶段会省掉操作规约，并多带一份工具目录。
 */
export function buildSystemPrompt(
  facts: PromptFacts,
  stage: PromptStage = 'execution',
): string {
  return assemble(
    STABLE_LAYERS.filter((layer) => inStage(layer, stage)),
    facts,
  )
}

/**
 * 本轮环境 → **对话末尾**。没有内容时返回 `null`（调用方就别插那条消息）。
 *
 * 两个阶段带的东西不同：`router` 只有页面摘要（选工具时得知道自己在哪），
 * `execution` 才是模式说明 / 容器策略 / 完整页面上下文 / 任务清单。
 */
export function buildTurnContext(
  facts: PromptFacts,
  stage: PromptStage = 'execution',
): string | null {
  const text = assemble(
    VOLATILE_LAYERS.filter((layer) => inStage(layer, stage)),
    facts,
  )
  return text.trim() ? text : null
}

/** 某个阶段会用到的层（供文档 / 调试 / token 自检引用）。 */
export function layersForStage(stage: PromptStage): readonly PromptLayer[] {
  return [...STABLE_LAYERS, ...VOLATILE_LAYERS].filter((layer) =>
    inStage(layer, stage),
  )
}
