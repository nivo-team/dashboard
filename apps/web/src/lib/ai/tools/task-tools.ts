import type { AiMessage, AiToolDefinition } from '../types'

export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
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

/**
 * 任务规划与执行清单工具（Todo List）。
 *
 * 借鉴现代 Agent（如 Claude Code / DeepAgent）的「计划 - 执行分离」机制：
 * 当用户给出包含多项任务或需批量处理多个对象的复合指令时（例如「帮我新建 3 个用户：张三、李四、王五」）：
 * 1. AI 首先调用此工具创建并输出结构化任务规划清单；
 * 2. 依次顺序执行每项子任务，执行前置为 in_progress，完成后置为 completed；
 * 3. 若用户取消或要求放弃剩余任务，将对应项标记为 cancelled；
 * 4. 界面会实时将此任务清单渲染为可视化的步骤进度卡片，让用户清晰看到推进流程。
 */
export const manageTasksTool: AiToolDefinition = {
  name: 'manage_tasks',
  description:
    '当用户的指令包含多个任务或需要分步处理多个对象时（例如「帮我新建 3 个用户：张三、李四、王五」），首先使用此工具创建任务清单（Todo List）。在执行每项任务前将其标记为 in_progress，完成后标记为 completed；若用户要求取消某些任务则标记为 cancelled。系统会在界面上展示实时任务进度卡片。',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '任务序号或唯一 ID，例如 "1", "2"' },
            title: {
              type: 'string',
              description: '任务简要描述，如「创建用户 张三」',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
              description: '当前状态',
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
  access: 'read',
  group: 'page',
  execute: async (input) => {
    const rawTasks = (input as { tasks?: TaskItem[] }).tasks ?? []
    const total = rawTasks.length
    const completedCount = rawTasks.filter((t) => t.status === 'completed').length
    const cancelledCount = rawTasks.filter((t) => t.status === 'cancelled').length
    const inProgressTask = rawTasks.find((t) => t.status === 'in_progress')

    return {
      ok: true,
      total,
      completedCount,
      cancelledCount,
      progress: total > 0 ? `${completedCount} / ${total}` : '0 / 0',
      current: inProgressTask ? inProgressTask.title : null,
      tasks: rawTasks,
    }
  },
}
