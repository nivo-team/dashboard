import { needsApproval, planHasWriteSteps } from '../approval-policy'
import { DATA_READ_GRANT } from '../session-permissions'
import type { AiMessage, AiToolContext, AiToolDefinition } from '../types'

/**
 * 任务清单（Todo）—— **AI 自主编排的执行单元**。
 *
 * ## 它解决什么
 *
 * 后端常常只提供**单条**的增删改（`DELETE /x/{id}`、`PUT /x`），没有批量接口。
 * 于是「把这一屏里所有停用的记录都删掉」这类请求，模型只能一条一条地调 ——
 * 而**每一次调用都要单独走一轮模型往返**（工具结果回给模型 → 模型再决定下一次调用）。
 * 20 条记录就是 20 次往返：慢、贵，而且模型在中途"忘了还剩几条"是常态。
 *
 * 这里的做法是把**编排**与**执行**分开：
 *
 * ```text
 * ① 模型调用 manage_tasks，一次给出**整组步骤**（每步 = 一个工具 + 它的入参）
 * ② 用户只看一眼整份计划、点一次「允许」
 * ③ 客户端**顺序执行**每一步（前一步 resolve 了才跑下一步），全程不打扰模型
 * ④ 全部跑完后，把**每一步的结果**作为这一次工具调用的返回值交给模型
 * ⑤ 模型据此写总结 / 回答用户
 * ```
 *
 * 于是 20 条记录只花**一次**模型往返。这也正是「一个任务完成后才会接着继续下一个」
 * 的落地方式：③ 里的 `await` 是串行的，前一步没结束不会有下一步。
 *
 * ## 步骤里的 `action` 是**可选**的
 *
 * 不带 `action` 的清单是**纯展示**的进度卡（模型想给用户看"我要做这几件事"，
 * 但具体动作自己逐步调用工具）—— 老行为完全保留。带了 `action` 才是批量执行。
 *
 * ## 安全边界
 *
 * 批量执行**不绕过任何一道闸**：`action.tool` 必须是**本轮真实发给模型**的工具名
 * （`resolveTools` 的产物，即已过权限 / 容器 / 表单过滤），而且要能通过该工具自己的
 * `requiredPermissions*` 校验。用户在计划卡上看到的是**完整步骤清单**，一次同意即
 * 授权这一组（而不是把审批静默跳过）—— 计划是用户看过的，才敢执行。
 */

export interface TaskAction {
  /** 要执行的工具名 —— 必须是本轮可用工具之一（如 call_write_api / run_page_command） */
  tool: string
  /** 传给该工具的入参（与它自己的 inputSchema 对齐） */
  input: Record<string, unknown>
}

export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  /** 该步骤要执行的动作；不传表示这是一张纯进度清单，由模型自己逐步调用工具 */
  action?: TaskAction
  /** 执行后的结果摘要（由执行引擎回填，模型据此写总结） */
  result?: string
}

/**
 * 从会话消息历史中提取最新的一份任务清单。
 */
export function getLatestSessionTasks(
  messages: readonly AiMessage[],
): TaskItem[] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]
      if (part.type === 'tool-call' && part.toolName === 'manage_tasks') {
        const rawInput = part.input as { tasks?: TaskItem[] } | undefined
        const rawOutput = part.output as { tasks?: TaskItem[] } | undefined
        const tasks = rawOutput?.tasks || rawInput?.tasks || []
        if (tasks.length > 0) return tasks
      }
    }
  }
  return null
}

/** 一次批量执行的逐步结果 —— 会作为 `manage_tasks` 的返回值交给模型。 */
interface StepOutcome {
  id: string
  title: string
  tool: string
  ok: boolean
  /** 成功时的结果（可能被截断），失败时是错误信息 */
  output?: unknown
  error?: string
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** 把任意结果压成一句可读摘要（给步骤结果与最终回执用）。 */
function summarizeOutput(value: unknown, max = 400): string {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (!text) return '（无返回）'
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text
}

/**
 * 批次的预授权凭据 —— 用户在计划卡上同意的那一组工具。
 *
 * **两个键都要装**，缺一不可：
 * - `tools`：子步骤要执行的**工具名**（`call_write_api` / `run_page_command`…），
 *   按它们决定"整批只确认一次"；
 * - `grants`：这些子步骤可能触发的**会话授权键**（`DATA_READ_GRANT` = `'data:read'`、
 *   `group:form`…）—— 读授权弹卡时 `request.toolName` 装的是**授权键而不是工具名**，
 *   只比工具名会漏掉它们，于是只读计划会在执行中途**逐个弹卡**，
 *   把"一次编排、一次确认"的意义抹掉（这正是修复前的表现）。
 */
export interface BatchGrant {
  /** 已被用户整批同意的工具名集合 */
  tools: Set<string>
  /** 已被整批覆盖的会话授权键（`data:read` 等） */
  grants?: Set<string>
}

/**
 * 造一个**带批次预授权**的上下文：只把 `requestApproval` 换掉，
 * 且**仅对已同意的工具 / 授权键**直接返回 true，其余仍走原审批通道。
 *
 * 预授权不会放开计划之外的东西：用户同意的是"这一批里这几步"，
 * 工具名与授权键都由**计划里真实出现的步骤**推导而来（见 `executePlan` 的调用点）。
 */
function withBatchGrant(ctx: AiToolContext, grant: BatchGrant): AiToolContext {
  return {
    ...ctx,
    requestApproval: async (request) => {
      if (grant.tools.has(request.toolName)) return true
      if (grant.grants?.has(request.toolName)) return true
      return ctx.requestApproval(request)
    },
  }
}

/** 连续失败多少步就熔断（避免一串注定失败的重试把时间耗光）。 */
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * **批量执行一个计划** —— 顺序跑完每一步，返回逐步结果。
 *
 * 三条刻意的设计：
 *
 * 1. **串行**（`for ... await`）：用户明确要求「一个任务完成后才继续下一个」。
 *    并行会让"删除同一条记录两次""先建后改但改先到"这类顺序依赖出错，
 *    而批量操作往往恰恰有顺序依赖（先查 id 再删那条）。
 * 2. **单步失败不中断整批**：记下错误、继续下一步，最后把失败项一并交回模型 ——
 *    比"第 3 步失败、剩下 17 条都不做"有用得多，模型还能据失败原因决定要不要补做。
 *    但**连续失败会熔断**，避免一串注定失败的重试。
 * 3. **预授权**（`BatchGrant`）：用户已经看过整份计划并点了同意，所以这一步里
 *    子工具自己的审批不再逐条弹出 —— 否则 20 条就是 20 张卡，把"一次编排"的意义抹掉。
 *    预授权**只对计划里声明过的工具**生效，不是无差别放行。
 */
async function executePlan(
  tasks: readonly TaskItem[],
  ctx: AiToolContext,
  batchGrant: BatchGrant,
): Promise<{ outcomes: StepOutcome[]; stopped: string | null }> {
  const outcomes: StepOutcome[] = []
  let consecutiveFailures = 0
  /** 未到达（还没开始）的步骤保持 pending —— 上报给 UI 的进度卡据此渲染 */
  const pendingIndex = new Map<string, number>()
  tasks.forEach((task, index) => pendingIndex.set(task.id, index))

  /**
   * 上报当前进度：**已跑过的**决定 completed/failed，**当前这一步**置 in_progress，
   * 其余保持 pending。整批是在一次工具调用里跑完的，界面全靠这次上报才能"动起来"。
   */
  const report = (currentId?: string) => {
    const upTo = currentId ? (pendingIndex.get(currentId) ?? tasks.length) : tasks.length
    ctx.reportTaskProgress(
      tasks.map((task, index) => {
        const outcome = outcomes.find((item) => item.id === task.id)
        if (outcome) {
          return {
            id: task.id,
            title: task.title,
            status: outcome.ok ? ('completed' as const) : ('failed' as const),
            ...(outcome.ok ? { result: String(outcome.output) } : { result: outcome.error }),
          }
        }
        if (index === upTo) {
          return { id: task.id, title: task.title, status: 'in_progress' as const }
        }
        return { id: task.id, title: task.title, status: 'pending' as const }
      }),
    )
  }

  for (const task of tasks) {
    if (task.status === 'cancelled') continue
    const action = task.action
    if (!action) {
      outcomes.push({
        id: task.id,
        title: task.title,
        tool: '（无动作）',
        ok: true,
        output: '这一步没有绑定动作，需要你自己调用工具完成。',
      })
      continue
    }

    // 开始这一步：先报一次进度，让界面把当前项标成"进行中"
    report(task.id)

    /*
      **提权闸**：`ctx.resolveTool` 只认「本轮真的发给模型的工具」（已过权限 / 容器 / 表单 /
      后端权限点）—— 模型不能借 `manage_tasks` 调用一个它根本没被授权持有的工具
      （例如只有 task:plan 却写 call_write_api）。审批卡防的是用户手滑，这里防的是模型越权。
    */
    const tool = ctx.resolveTool(action.tool)
    if (!tool) {
      outcomes.push({
        id: task.id,
        title: task.title,
        tool: action.tool,
        ok: false,
        error: `当前不可用这个工具：${action.tool}（不存在，或不在本轮已授权的工具范围内）`,
      })
      consecutiveFailures += 1
      continue
    }

    try {
      // 用带预授权的上下文执行：用户已同意整份计划，子工具不再逐条弹卡
      const output = await tool.execute(action.input, withBatchGrant(ctx, batchGrant))
      outcomes.push({
        id: task.id,
        title: task.title,
        tool: action.tool,
        ok: true,
        output: summarizeOutput(output),
      })
      consecutiveFailures = 0
    } catch (error) {
      outcomes.push({
        id: task.id,
        title: task.title,
        tool: action.tool,
        ok: false,
        error: describeError(error),
      })
      consecutiveFailures += 1
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        report()
        return {
          outcomes,
          stopped: `连续 ${MAX_CONSECUTIVE_FAILURES} 步失败，已中止剩余步骤（通常是权限或参数问题，继续跑没有意义）。`,
        }
      }
    }
  }

  // 整批结束：把最后状态刷一遍（此时所有跑过的项都已是终态）
  report()
  return { outcomes, stopped: null }
}

/**
 * 任务规划与执行清单工具（Todo List）。
 *
 * 两副面孔，由有没有 `action` 决定：
 *
 * - **纯清单**（每个 task 只有 id / title / status）：给用户看进度，模型自己逐步动手。
 * - **可执行计划**（task 带 `action: { tool, input }`）：**这一步就把整批做完**。
 *   模型一次把 N 个步骤写全（`tool` 取本轮可用工具名），客户端顺序执行、
 *   把每步结果一并回传。**这是后端没有批量接口时做批量操作的正道**。
 *
 * 什么时候用哪副：**批量 / 多步骤且步骤之间相互独立或顺序固定** → 可执行计划；
 * 需要**看一步结果再决定下一步**（探测式） → 纯清单 + 逐步调用工具。
 */
export const manageTasksTool: AiToolDefinition = {
  name: 'manage_tasks',
  catalogDescription: '编排并批量执行多步骤任务（批量操作必选）',
  description: [
    '多任务 / 批量操作的编排与执行入口。',
    '**做批量操作（尤其后端没有批量接口、只能逐条调用时）必须用它**：把整组步骤一次写全，每步带上 action（tool 取本轮可用工具名 + 它的入参），客户端会**顺序执行每一步**（前一步完成才做下一步），再把每步结果一并返回给你。这样只需一次往返，不要循环调用单条接口。',
    '只在需要「先看一步结果再决定下一步」时才用不带 action 的纯清单。',
    '任一 action 都必须是你已实际持有的工具；写操作整批只让用户确认一次（他会看到完整步骤清单），不要因此改成逐步调用。',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '任务序号或唯一 ID，例如 "1", "2"' },
            title: { type: 'string', description: '任务简要描述，如「删除记录 10001」' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
              description: '当前状态；初次编排时全部填 pending',
            },
            action: {
              type: 'object',
              description:
                '这一步要执行的动作（可选）。带上它就表示由客户端替你顺序执行；不带则只是进度清单。',
              properties: {
                tool: {
                  type: 'string',
                  description:
                    '工具名，必须是本轮可用工具之一（如 call_write_api / run_page_command / call_read_api）',
                },
                input: {
                  type: 'object',
                  description: '传给该工具的入参，与它自己的参数定义完全一致',
                  additionalProperties: true,
                },
              },
              required: ['tool', 'input'],
              additionalProperties: false,
            },
          },
          required: ['id', 'title', 'status'],
        },
        description: '任务列表数组',
      },
    },
    required: ['tasks'],
    additionalProperties: false,
  },
  capability: 'task:plan',
  /*
    依赖：计划里的 action 能指向这些工具，所以它们必须一起在场（`resolveTools` 会自动补齐，
    当前权限 / 容器下拿不到的那些会被自动丢掉 —— 补一个拿不到的工具没有意义）。
  */
  dependencies: ['call_write_api', 'run_page_command', 'call_read_api', 'get_page_data'],
  execute: async (input, ctx) => {
    const rawTasks = (input as { tasks?: TaskItem[] }).tasks ?? []
    const total = rawTasks.length
    const executable = rawTasks.filter((task) => task.action)

    // ── 纯清单：老行为，只回报进度（模型自己逐步动手）
    if (executable.length === 0) {
      const completedCount = rawTasks.filter((t) => t.status === 'completed').length
      const cancelledCount = rawTasks.filter((t) => t.status === 'cancelled').length
      return {
        ok: true,
        total,
        completedCount,
        cancelledCount,
        progress: total > 0 ? `${completedCount} / ${total}` : '0 / 0',
        tasks: rawTasks,
        note: '已登记为进度清单。请按顺序逐个调用工具完成每一步，并同步更新每步状态。',
      }
    }

    // ── 可执行计划：整批确认一次，然后顺序执行
    const planLines = rawTasks
      .map(
        (task, index) =>
          `${index + 1}. ${task.title}${task.action ? `（${task.action.tool}）` : ''}`,
      )
      .join('\n')

    /*
      计划卡要不要弹 —— 交给审批策略表的 `plan` 那一行，判据是**这份计划里有没有写操作**：

      - **含写操作** → 两个模式都要用户点头。这是刻意的：`manage_tasks` 一次能改几十条，
        而这张卡是用户唯一能看到**完整步骤清单**的机会（单条 `call_write_api` 在 auto 下
        本来就仍会弹，所以卡并不会因此消失）。
      - **纯只读计划** → `auto` 下不打断（读数据在 auto 下本来就不问，见策略表 `read` 行）。

      "有没有写操作"按**步骤所用工具的能力格子**判（`planHasWriteSteps`），不是按工具名 ——
      将来新增的写工具会自动被认出来。
    */
    const stepCapabilities = executable.flatMap((task) => {
      const capability = task.action ? ctx.resolveTool(task.action.tool)?.capability : undefined
      return capability ? [{ capability }] : []
    })

    if (needsApproval('plan', { mode: ctx.mode, planHasWrites: planHasWriteSteps(stepCapabilities) })) {
      const approved = await ctx.requestApproval({
        toolName: 'manage_tasks',
        input: { steps: rawTasks.map((t) => ({ title: t.title, action: t.action })) },
        reason: `AI 准备一次执行以下 ${executable.length} 个步骤（顺序执行，中途不再逐条询问）：\n${planLines}`,
      })
      if (!approved) {
        throw new Error(
          '用户拒绝了这份执行计划，没有任何步骤被执行。不要重试同一份计划，改为向用户说明并询问下一步。',
        )
      }
    }

    /*
      预授权只覆盖**计划里真正用到的工具**（由模型声明、且已通过本工具可用性检查的那些）——
      不是"这一批里放行所有写工具"。
    */
    const grantedTools = new Set(
      executable.map((task) => task.action?.tool).filter(Boolean) as string[],
    )
    /*
      读数据的会话授权键（`data:read`）：这些子步骤里只要有**读类**工具，
      用户在这张计划卡上就已经同意"整批做下去"了，中途不该再为每一步弹一次读授权。
      授权键与工具名是两个命名空间（`requestApproval` 收的是前者），所以必须单独装一份。
    */
    const grantedGrants = new Set<string>()
    for (const toolName of grantedTools) {
      const capability = ctx.resolveTool(toolName)?.capability
      if (capability === 'data:query' || capability === 'page:read' || capability === 'form:read') {
        grantedGrants.add(DATA_READ_GRANT)
      }
    }
    const { outcomes, stopped } = await executePlan(rawTasks, ctx, {
      tools: grantedTools,
      grants: grantedGrants,
    })

    const successCount = outcomes.filter((item) => item.ok).length
    const failureCount = outcomes.length - successCount

    return {
      ok: failureCount === 0,
      total,
      executed: outcomes.length,
      successCount,
      failureCount,
      progress: `${successCount} / ${outcomes.length}`,
      outcomes,
      ...(stopped ? { stopped } : {}),
      // 让 UI 的进度卡能反映最终状态：成功的置 completed，失败的置 failed
      tasks: rawTasks.map((task) => {
        if (!task.action) return task
        const outcome = outcomes.find((item) => item.id === task.id)
        if (!outcome) return { ...task, status: 'cancelled' as const }
        return {
          ...task,
          status: outcome.ok ? ('completed' as const) : ('failed' as const),
          ...(outcome.ok ? { result: outcome.output } : { result: outcome.error }),
        }
      }),
      note:
        failureCount === 0
          ? `全部 ${outcomes.length} 个步骤已顺序执行完成。请根据 outcomes 里每一步的实际结果向用户汇报（可在正文用 Markdown 表格列出明细）。`
          : `已执行 ${outcomes.length} 步，其中 ${failureCount} 步失败。请如实说明失败的是哪几步、原因是什么，并询问用户是否要重试或调整。`,
    }
  },
}
