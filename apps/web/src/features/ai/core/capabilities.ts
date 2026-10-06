import type { AiPermissionMode } from './types'

/**
 * **AI 能力矩阵** —— 「AI 能做什么」的**唯一真值**（工具、权限界面、运行时过滤共用）。
 *
 * ## 为什么不再用「一串工具名」
 *
 * 早先的权限模型是「三档（只读 / 完全访问 / 自定义）+ 一份勾选的工具名清单」。
 * 它对**用户**几乎不可读：设置页上是一屏 18 个勾选框，用户看到的是 `call_write_api`、
 * `check_result_match` 这样的实现名，而不是「AI 能不能改我的数据」。
 * 更糟的是粒度错位 —— 「填表」与「提交」在用户心里是两件事，在清单里却是两个工具名。
 *
 * 现在改成 **能力行 × 动作列** 的矩阵：**一行一个能力、行内是该能力的若干动作**。
 *
 * ```text
 * 页面   读取 · 跳转 · 操作
 * 数据   查询 · 修改
 * 表单   读取 · 更新 · 提交
 * 任务   编排 · 授权
 * ```
 *
 * 每个**格子**是一次可独立授权的动作，键形如 `page:read`（`能力:动作`）。
 * 工具**声明自己占哪个格子**（`AiToolDefinition.capability`），运行时就按格子过滤 ——
 * 于是「界面上勾了什么」与「模型拿到什么工具」是同一件事的两种呈现，不可能分叉。
 *
 * ## 三条硬约定
 *
 * 1. **格子的键用的是 `{域}:{动作}` 写法** —— 与 `permissions.get.ts` 的后端权限点、
 *    `feature.ts` 的 `command.permission` 同一门语言（只是域换成了能力行）。
 * 2. **加一个工具 = 在它身上填一个已有的格子**；只有确实属于新动作时才往这里加一格
 *    （加格子会同时改变权限界面与既有用户的勾选集，是**破坏性**的）。
 * 3. **预设档只是格子集合的名字**（见 `presetCapabilityGrants`）：`readonly` / `full`
 *    不是特殊分支，就是两份预设的勾选。这样「从只读切到自定义」能继承当前档的真实勾选。
 */

/** 一次可独立授权的动作 —— 矩阵里的一格。 */
export type AiCapabilityGrant =
  // 页面
  | 'page:read'
  | 'page:navigate'
  | 'page:operate'
  // 数据
  | 'data:query'
  | 'data:write'
  // 表单
  | 'form:read'
  | 'form:update'
  | 'form:submit'
  // 任务
  | 'task:plan'
  | 'task:grant'

/** 能力行键（格子键的前半段）。 */
export type AiCapabilityKey = 'page' | 'data' | 'form' | 'task'

export interface AiCapabilityActionSpec {
  /** 格子键；界面上一行里的一枚勾选 */
  grant: AiCapabilityGrant
  /** 用户可见的动作名（如「读取」「跳转」） */
  label: string
  /** 这一格放行到什么程度 —— 挂 tooltip，不常显 */
  hint: string
}

export interface AiCapabilitySpec {
  key: AiCapabilityKey
  /** 行名（如「页面」「数据」「表单」「任务」） */
  label: string
  /** 这一行整体在做什么 —— 挂行标题的 tooltip */
  hint: string
  actions: readonly AiCapabilityActionSpec[]
}

/**
 * 能力矩阵本体 —— **顺序即界面上的行序**。
 *
 * 动作列的取舍（为什么是这几个而不是「增删改查」）：
 * - **页面**：`读取`（看清自己在哪、现在几点、这一页有什么数据）与 `跳转`（把用户带到别处）
 *   是两件事 —— 跳转不改任何东西，却会把用户带离当前上下文，所以能分别授权；
 *   `操作` 指页面上那些**页面自己实现的动作**（新建 / 删除 / 导出），各有副作用与确认语义。
 * - **数据**：`查询`（含跨页面聚合、统计分析）与 `修改` 分开是底线；修改必须逐次确认。
 * - **表单**：`读取`（表单结构）/ `更新`（打开并填写，尚未入库）/ `提交`（入库）三档 ——
 *   这正是「打开表单算读取还是更新」的答案：**打开表单的唯一目的就是改数据，
 *   所以它与填写同属 `更新`**；只看不改的路径是详情页，不是表单。
 * - **任务**：`编排`是批量任务的推进器（一次性生成整批步骤、由客户端顺序执行完再回传结果）；
 *   `授权`是 AI 主动向你申请更多能力（继续上一轮任务时用）。
 */
export const AI_CAPABILITIES: readonly AiCapabilitySpec[] = [
  {
    key: 'page',
    label: '页面',
    hint: '与当前页面有关的能力：看懂自己在哪里、把界面带到别的页面、执行页面自己的操作',
    actions: [
      {
        grant: 'page:read',
        label: '读取',
        hint: '读取当前位置、当前时间、这一页用到的接口与已加载的数据；也能按描述检索后台有哪些页面',
      },
      {
        grant: 'page:navigate',
        label: '跳转',
        hint: '把界面带到后台里的另一个页面（不改任何数据，但仍会按模式确认）',
      },
      {
        grant: 'page:operate',
        label: '操作',
        hint: '执行页面自己提供的操作（新建 / 删除 / 批量处理 / 导出）；有副作用的会先请你确认',
      },
    ],
  },
  {
    key: 'data',
    label: '数据',
    hint: '绕过页面、直接与后端接口打交道的能力',
    actions: [
      {
        grant: 'data:query',
        label: '查询',
        hint: '调只读接口取数，支持把多个页面的数据聚合成一份统计；也可做分析与存在性核对',
      },
      {
        grant: 'data:write',
        label: '修改',
        hint: '调写入接口新增 / 修改 / 删除数据；每一次都会弹确认卡，删除不可撤销',
      },
    ],
  },
  {
    key: 'form',
    label: '表单',
    hint: '页面表单的三段能力：看清结构、替你填好、提交入库',
    actions: [
      { grant: 'form:read', label: '读取', hint: '读取页面上表单的结构与字段定义' },
      {
        grant: 'form:update',
        label: '更新',
        hint: '打开表单并替你把字段填好（只改页面上的内容，尚未入库）',
      },
      { grant: 'form:submit', label: '提交', hint: '把填好的表单提交入库（会写入真实数据）' },
    ],
  },
  {
    key: 'task',
    label: '任务',
    hint: '多步骤 / 批量任务的编排与推进',
    actions: [
      {
        grant: 'task:plan',
        label: '编排',
        hint: '把一批操作编排成任务清单，一次性生成整组步骤并由客户端顺序执行完，再把结果交回 AI 总结',
      },
      { grant: 'task:grant', label: '授权', hint: '在继续上一轮任务前，主动向你申请所需的操作授权' },
    ],
  },
]

/** 全部格子键（顺序与矩阵一致）。 */
export function allCapabilityGrants(): AiCapabilityGrant[] {
  return AI_CAPABILITIES.flatMap((capability) =>
    capability.actions.map((action) => action.grant),
  )
}

const KNOWN_GRANTS = new Set<string>(allCapabilityGrants())

/** 判断一个格子键是否真实存在于矩阵（用于清洗历史存档里的脏值）。 */
export function isKnownCapabilityGrant(value: unknown): value is AiCapabilityGrant {
  return typeof value === 'string' && KNOWN_GRANTS.has(value)
}

/** 格子键 → 它所属的能力行。 */
export function capabilityKeyOf(grant: string): AiCapabilityKey {
  return (grant.split(':')[0] as AiCapabilityKey) ?? 'page'
}

/**
 * 三档预设 = **三份格子集合**。
 *
 * - `readonly`（只读，默认）：能看、能带路、能读表单、能编排任务，但**一个字都改不了**；
 * - `full`（完全访问）：全部格子；
 * - `custom`（自定义）：由用户逐格勾选（这里返回空集，真实勾选在偏好 store 的 `aiCapabilities`）。
 *
 * 注意 `readonly` 里**必须有 `task:plan`**：任务编排本身是只读的（它只登记清单并驱动
 * 已被允许的工具），少了它，只读档的 AI 连「把这件事拆成 5 个页面看一遍」都做不到。
 * `page:navigate` 同理 —— 「看哪里」不是「改什么」（见 `AiToolDefinition.capability` 的约定）。
 */
export function presetCapabilityGrants(mode: AiPermissionMode): AiCapabilityGrant[] {
  if (mode === 'full') return allCapabilityGrants()
  if (mode === 'readonly') {
    return ['page:read', 'page:navigate', 'data:query', 'form:read', 'task:plan']
  }
  return []
}
