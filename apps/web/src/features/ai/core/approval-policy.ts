import type { AiMode } from './types'

/**
 * **审批策略** —— 「这个动作在这一档模式下要不要弹确认卡」的**唯一真值**。
 *
 * ## 为什么必须有这一层
 *
 * 早先的约定只写了一句话：「`ask` 动手前先问、`auto` 能直接做就直接做」。
 * 它定义了 `auto` **能**做什么，却**没有定义 `auto` 下谁还不该问** —— 于是每个工具
 * 各写各的条件（`ctx.mode === 'ask'` 抄了七八遍），很快就出了两处实打实的错：
 *
 * ```ts
 * // form-tools.ts 的 submit_form —— 右侧恒为 true，`ctx.mode` 白读了
 * const requireApproval = formSpec?.submission?.requireApproval ?? (ctx.mode === 'ask' || true)
 * ```
 *
 * 后果是**自动模式下提交表单照样弹卡**，与工具描述、能力表格、输入区文案
 * （「自动填写并提交表单」）三处全部矛盾 —— 而因为恒真，三个业务表单里
 * 显式声明的 `requireApproval` 也成了永远读不到的死代码。
 *
 * 现在把「哪种动作、在哪种模式下要不要问」收成**下面这一张表**：工具不再自己判断，
 * 一律调 `needsApproval(intent, ctx)`。加一个工具时只挑一个 `intent`，
 * 不必（也不许）再写一遍模式判断。
 *
 * ## 这张表就是约定本身
 *
 * | 动作性质 | `ask` | `auto` | 为什么 |
 * |---|---|---|---|
 * | `read` 读业务数据 | **首次问**（会话授权后免） | 不问 | 只读不改变任何东西；`auto` 的语义就是别打断 |
 * | `fill` 改页面内容（填表） | 问 | 不问 | 只改页面状态、不落库，用户看得见、可撤销 |
 * | `submit` 提交表单入库 | 问 | **不问** | 表单自带 `canSubmit()` 把关、用户能预览填了什么；`auto` 下免问正是这个模式的意义 |
 * | `write` 通用写接口 / 页面写指令 | 问 | **仍问** | 刻意的例外：没有可预览的表单，自动执行等于让模型直接改库 |
 * | `navigate` 跳转 | 问 | 不问 | 「看哪里」不是「改什么」；`auto` 等于始终允许 |
 * | `plan` 批量编排 | 问 | **含写操作才问** | 只读计划不该打断；写计划是用户唯一能看到**完整步骤清单**的机会 |
 * | `probe` 存在性探测 | **每次问** | **每次问** | 唯一能逐次试探出"某个值在不在"的工具，交互层是主要防线 |
 *
 * 两条读数边界，改之前先想清楚：
 *
 * 1. **`read` 在 `auto` 下不弹**（读业务数据不再逐次经用户同意）—— 这是**刻意的放宽**，
 *    前提是「权限」那一维已经在**把工具交给模型之前**收过口（没权限的读工具根本不下发），
 *    真正的硬边界仍是执行时后端按用户身份校验。
 * 2. **`write` 与 `probe` 是两个不随模式松动的口子**：前者因为没有可预览的表单，
 *    后者因为它是枚举攻击的主要通道。它们**不读 `ctx.mode`**。
 */

/**
 * 一次动作的**性质** —— 它是这张表的行。
 *
 * 挑 `intent` 只问一件事：**这个动作改变了什么、用户能不能看见后果**。
 * 不要按工具名去对应（`call_write_api` 是 `write`，但 `run_page_command` 要看它跑的是哪条指令）。
 */
export type AiApprovalIntent =
  /** 读业务数据：页面数据 / 只读接口 / 统计分析 / 表单里的已有内容 */
  | 'read'
  /** 改页面上的内容：填表（不落库） */
  | 'fill'
  /** 提交表单入库 */
  | 'submit'
  /** 通用写接口、页面上会改数据的指令 —— **两个模式都要问** */
  | 'write'
  /** 跳转 */
  | 'navigate'
  /** 批量计划编排（要不要问取决于计划里有没有写操作，见 `planHasWrites`） */
  | 'plan'
  /** 存在性探测 —— **两个模式都每次问** */
  | 'probe'

export interface AiApprovalPolicyContext {
  /** 当前输入模式。**只有 `read` / `fill` / `submit` / `navigate` / `plan` 会读它** */
  mode: AiMode
  /**
   * 仅 `plan` 用：这份计划里是否**含会改动数据的步骤**。
   *
   * `true` → 两个模式都要用户点头（他要看到完整步骤清单才敢放手）；
   * `false` / 未传 → 只读计划，按 `mode` 决定（`auto` 不打断）。
   */
  planHasWrites?: boolean
}

/**
 * **这张表本身** —— 一个 `intent` 对应一个纯函数，输入模式、输出要不要弹卡。
 *
 * 写成 `Record<AiApprovalIntent, ...>` 而不是 `switch`：漏掉一个 `intent` 会直接
 * 编译不过（`switch` 只会静默走到 `default`）—— 加 `intent` 时正好逼你面对这张表。
 */
const POLICY: Record<AiApprovalIntent, (ctx: AiApprovalPolicyContext) => boolean> = {
  // 读数据：询问模式首次问一句（`DATA_READ_GRANT` 会话授权负责"只问一次"），自动模式不问
  read: ({ mode }) => mode === 'ask',
  // 填表：同上。只改页面状态、不落库
  fill: ({ mode }) => mode === 'ask',
  // 提交入库：`ask` 问；`auto` 免问 —— 表单自己的 `canSubmit()` 才是这里的把关人
  submit: ({ mode }) => mode === 'ask',
  // 写操作：**不读 mode**。没有可预览的表单，自动执行等于让模型直接改库
  write: () => true,
  // 跳转：`ask` 问（"自动跳转"设置由调用方另行短路），`auto` 直接跳
  navigate: ({ mode }) => mode === 'ask',
  // 批量计划：含写操作才问（写计划是用户唯一能看到完整步骤清单的机会）
  plan: ({ mode, planHasWrites }) => planHasWrites === true || mode === 'ask',
  // 存在性探测：**不读 mode**，两个模式都每次问
  probe: () => true,
}

/**
 * 这个动作在当前模式下要不要弹确认卡 —— **工具层唯一的判断入口**。
 *
 * 被拒后的收尾（抛错、不重试）仍由各工具自己负责：那是错误话术，不是策略。
 */
export function needsApproval(intent: AiApprovalIntent, ctx: AiApprovalPolicyContext): boolean {
  return POLICY[intent](ctx)
}

/**
 * 一份批量计划里**是否含会改动数据的步骤** —— 决定 `plan` 那一行怎么判。
 *
 * 判据是**步骤所用工具的能力格子**（`tool.capability`），不是工具名：
 * `data:write` / `form:submit` / `page:operate` 都是"会改数据"。
 * 走格子而非名字，是为了让将来新增的写工具**自动**被认出来，不必回来改这张表。
 */
export const WRITE_CAPABILITIES: readonly string[] = ['data:write', 'form:submit', 'page:operate']

export function planHasWriteSteps(steps: readonly { capability?: string }[]): boolean {
  return steps.some(
    (step) => step.capability !== undefined && WRITE_CAPABILITIES.includes(step.capability),
  )
}
