import type { LocaleKey } from '#/lib/locale'
import { formatPageContext, getPageContext } from '../page-context'
import type { AiMode, AiPageContext, AiSurface } from '../types'
import { buildCapabilityLayer } from './capability'
import { buildIdentityLayer } from './identity'
import { buildOutputLayer } from './output'
import { buildScopeLayer } from './scope'
import { buildActiveTasksLayer, buildWorkflowLayer } from './workflow'

/**
 * 系统提示词的**分层装配处**。
 *
 * 为什么要把提示词拆成「层」而不是攒一个大字符串：这一份提示词同时承担了五件互不相同的事 ——
 * 你是谁（身份）、**什么该答什么该拒（范围闸）**、手上有什么（能力）、怎么做事（工作方式）
 * 与怎么说话（回答方式）。它们**改动的原因各不相同**：加工具改能力层、加页面改范围层的清单
 * 来源、调语气改回答层。混在一起写的结果是每加一句都在赌「会不会把边界冲淡」——
 * 尤其是**范围闸**：它必须短、必须靠前、必须一眼看得出来，掺进 30 行操作细则里就会被模型平均掉。
 *
 * 三条硬约定（与 AGENTS.md 铁律 4 同源）：
 *
 * 1. **顺序只有一份真值** —— 就是下面的 `PROMPT_LAYERS`。加一层 = 加一个 builder 并在数组里
 *    占一个位置，不要在别处再拼提示词（`runtime.ts` 里只调 `buildSystemPrompt` 这一个出口）。
 * 2. **每层只写一件事**，并且**只描述事实与规则，不复述权限**：权限由「本轮实际交给模型的
 *    工具清单」精确表达，提示词里写死一句「你只能读」，权限改了而这里忘了改，模型就会
 *    放着给它的工具不用、反过来告诉用户「我没权限」（真实踩过，见 capability 层注释）。
 * 3. **一切随环境变化的内容都要经过函数**（会话、应用、导航清单、语言），这样将来要按权限 /
 *    应用 / 环境收窄时，落点在内层函数里**一处**，而不是散在几十行字符串常量里。
 *
 * 提示词**每轮请求重算**（`buildSystemPrompt`），绝不缓存成常量：页面上下文含标题、
 * 任务清单含会话状态、范围清单含当前 appId 与界面语言 —— 缓存等于把它们焊在第一轮。
 */

/** 各层的输入：**每轮只采一次**的上下文快照 + 本轮的模式、容器与输出语言。 */
export interface PromptLayerInput {
  /** 当前模式（ask / auto）—— 只影响「用起来要不要问」，不影响范围判定 */
  mode: AiMode
  /**
   * 当前容器（面板 / 全屏）。
   *
   * 它决定「工作方式」层的策略：面板鼓励带用户去页面（面板不随路由消失），
   * 全屏默认不跳、把数据直接渲染在对话里 —— 详见 `workflow.ts` 的文件注释。
   * 它**只影响策略，不影响范围闸**：业务/越界的判定在两个容器里完全一致。
   */
  surface: AiSurface
  /** 已解析过的具体输出语言（不是 `auto`） */
  outputLocale: LocaleKey
  /**
   * 本轮采集到的页面上下文。
   *
   * **一次采集、各层共用同一份**：`getPageContext()` 刻意不缓存（标题随页面异步变化），
   * 但同一次装配里必须看到同一个快照，否则「范围层里的应用」与「上下文层里的应用」
   * 理论上有机会不是同一个。
   */
  context: AiPageContext
  /** 应用显示名（缺省时给一个中性说法，避免提示词里出现 `null`） */
  appName: string
}

/** 一层提示词：`build` 返回 `null` 表示这一层这轮不参与（例如没有进行中的任务）。 */
export interface PromptLayer {
  /** 层的稳定标识，供文档 / 调试引用（不要用作渲染 key 之外的东西） */
  id: string
  /** 层的职责一句话（与 `.agents/docs/ai-architecture.md` 的表格一一对应） */
  title: string
  build: (input: PromptLayerInput) => string | null
}

/** L6：当前页面上下文（我在哪）。内容全部来自 `formatPageContext` 这一个出口。 */
function buildPageContextLayer(input: PromptLayerInput): string {
  return ['# 当前页面上下文', formatPageContext(input.context)].join('\n')
}

/**
 * 层的**顺序即优先级**：身份 → 范围闸 → 能力 → 工作方式 → 回答方式 → 事实。
 *
 * 范围闸刻意排在**第二位**（仅次于身份）：分诊是"每一轮的第一件事"，越靠后越容易被后面的细则淹没；
 * 而可变的**事实**（当前页面、任务清单）放在最后 —— 它们是"执行时要用到的数据"，
 * 不是规则，放前面反而会把规则挤散。
 */
export const PROMPT_LAYERS: readonly PromptLayer[] = [
  { id: 'identity', title: '身份与定位', build: buildIdentityLayer },
  { id: 'scope', title: '请求分诊与范围闸', build: buildScopeLayer },
  { id: 'capability', title: '能力边界与操作前确认', build: buildCapabilityLayer },
  { id: 'workflow', title: '工作方式与决策优先级', build: buildWorkflowLayer },
  { id: 'output', title: '回答方式与语言', build: buildOutputLayer },
  { id: 'page-context', title: '当前页面上下文', build: buildPageContextLayer },
  { id: 'active-tasks', title: '进行中的任务清单', build: buildActiveTasksLayer },
]

/**
 * 拼系统提示词 —— **每次请求都重新算**，不要把它缓存成常量。
 *
 * 页面上下文**每轮重新采集**并注入（而不是让模型每轮先调一次工具）：
 * 「我在哪」是每次回答都要用的信息，为它多花一次往返不划算。
 *
 * 空层（返回 `null` 或只有空白）不参与拼接，层与层之间空一行 —— 于是「这轮没有任务清单」
 * 在提示词里表现为**整段不存在**，而不是留下一个空标题。
 */
export function buildSystemPrompt(
  mode: AiMode,
  outputLocale: LocaleKey,
  surface: AiSurface,
): string {
  const context = getPageContext()
  const input: PromptLayerInput = {
    mode,
    surface,
    outputLocale,
    context,
    appName: context.appName ?? '管理后台',
  }

  return PROMPT_LAYERS.map((layer) => layer.build(input))
    .filter((text): text is string => Boolean(text && text.trim()))
    .join('\n\n')
}
