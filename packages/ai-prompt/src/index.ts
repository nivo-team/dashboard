import { buildCapabilityLayer, buildModeRuleLayer } from './layers/capability.ts'
import { buildIdentityLayer } from './layers/identity.ts'
import { buildOutputLayer } from './layers/output.ts'
import { buildScopeLayer } from './layers/scope.ts'
import {
  buildActiveTasksLayer,
  buildPlaybookLayer,
  buildWorkflowLayer,
} from './layers/workflow.ts'
import type { PromptFacts, PromptLayer } from './types.ts'

export * from './types.ts'
export { buildIdentityLayer } from './layers/identity.ts'
export { buildScopeLayer } from './layers/scope.ts'
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
 * | **稳定** | `buildSystemPrompt(facts)` | `messages[0].role = 'system'` | 身份 / 范围闸 / 能力边界 / 通用工作方式 / 回答方式 |
 * | **变动** | `buildTurnContext(facts)` | 对话**末尾**（最后一条 user 之前） | 本轮模式说明 / 容器策略 / 页面上下文 / 任务清单 |
 *
 * **为什么必须分开**：`system` 在 messages 的**最前面**，它里面任何一处变化，都会让
 * **它后面的一切（包括整段对话历史）**失去服务商的前缀缓存（prompt caching）匹配。
 * 而历史才是 token 大头 —— 把「每轮都变 / 切换就变」的内容留在 system 里，
 * 等于**每轮都在为整段历史重新付费**。
 *
 * 所以：**新加一层时先问它会不会随环境变**；会变就标 `volatile: true` 放进 `VOLATILE_LAYERS`。
 * 详见 `.agents/docs/ai-server-layer.md` §缓存对齐。
 *
 * 另外两条硬约定：
 *
 * 1. **顺序只有一份真值** —— 就是下面的两个数组。加一层 = 加一个 builder 并在数组里占位，
 *    不要在别处再拼提示词。
 * 2. **每层只写一件事**，并且**只描述事实与规则，不复述权限**：权限由「本轮实际交给模型的
 *    工具清单」精确表达，提示词里写死一句「你只能读」，权限改了而这里忘了改，模型就会
 *    放着给它的工具不用、反过来告诉用户「我没权限」（真实踩过，见 capability 层注释）。
 *
 * 提示词**每轮请求重算**，绝不缓存成常量；但相同 facts 必须产出**逐字节相同**的结果
 * —— 这是前缀缓存能命中的前提（不要引入时间戳、随机数、Map 遍历顺序）。
 */

/** L6：当前页面上下文（我在哪）。内容全部来自调用方给出的 `formatPageContext` 出口。 */
function buildPageContextLayer(facts: PromptFacts): string {
  return ['# 当前页面上下文', facts.pageContextText].join('\n')
}

/**
 * **稳定层** —— 同一应用 + 同一语言下逐字节相同，进 system 前缀。
 *
 * 顺序即优先级：范围闸刻意排在**第二位**（仅次于身份）：分诊是"每一轮的第一件事"，
 * 越靠后越容易被后面的细则淹没。
 */
export const STABLE_LAYERS: readonly PromptLayer[] = [
  { id: 'identity', title: '身份与定位', build: buildIdentityLayer },
  { id: 'scope', title: '请求分诊与范围闸', build: buildScopeLayer },
  { id: 'capability', title: '能力边界', build: buildCapabilityLayer },
  { id: 'workflow', title: '工作方式与决策优先级', build: buildWorkflowLayer },
  { id: 'output', title: '回答方式与语言', build: buildOutputLayer },
]

/**
 * **变动层** —— 随模式 / 容器 / 页面 / 任务变化，落在对话末尾。
 *
 * 放在末尾之后，这些内容一旦进入历史就**不再变**（它是当时那一轮说出去的），
 * 于是下一轮的前缀仍然完整命中。
 */
export const VOLATILE_LAYERS: readonly PromptLayer[] = [
  { id: 'mode-rule', title: '本轮模式说明', volatile: true, build: buildModeRuleLayer },
  {
    id: 'playbook',
    title: '本轮决策优先级（按容器）',
    volatile: true,
    build: buildPlaybookLayer,
  },
  {
    id: 'page-context',
    title: '当前页面上下文',
    volatile: true,
    build: buildPageContextLayer,
  },
  {
    id: 'active-tasks',
    title: '进行中的任务清单',
    volatile: true,
    build: buildActiveTasksLayer,
  },
]

/** 全部层（顺序即最终拼接顺序），供文档 / 调试 / 自检引用。 */
export const PROMPT_LAYERS: readonly PromptLayer[] = [
  ...STABLE_LAYERS,
  ...VOLATILE_LAYERS,
]

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
 */
export function buildSystemPrompt(facts: PromptFacts): string {
  return assemble(STABLE_LAYERS, facts)
}

/**
 * 本轮环境 → **对话末尾**。没有内容时返回 `null`（调用方就别插那条消息）。
 */
export function buildTurnContext(facts: PromptFacts): string | null {
  const text = assemble(VOLATILE_LAYERS, facts)
  return text.trim() ? text : null
}
