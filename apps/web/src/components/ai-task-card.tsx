import {
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  ListChecksIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/cn'
import { useAiSessionStore, type AiMessage, type AiMessagePart } from '#/lib/ai'

export interface TaskItemData {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

/**
 * 提取当前活跃（进行中）的任务列表。
 * 条件：最新一条助手消息含有 manage_tasks 工具调用，且当前正在运行中（streaming）且未全量完成。
 */
export function getActiveTaskData(
  messages: AiMessage[],
  status: string,
): { tasks: TaskItemData[] } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    // 逆序查找最后一个 manage_tasks
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]
      if (part.type === 'tool-call' && part.toolName === 'manage_tasks') {
        const rawInput = part.input as { tasks?: TaskItemData[] } | undefined
        const rawOutput = part.output as { tasks?: TaskItemData[] } | undefined
        const tasks = rawOutput?.tasks || rawInput?.tasks || []
        if (tasks.length === 0) return null

        const allCompleted = tasks.every((t) => t.status === 'completed')
        const isStreaming = status === 'streaming' && i === messages.length - 1

        // 进行中：正在流式执行且尚未全部完成 -> 悬浮在输入框上方
        if (isStreaming && !allCompleted) {
          return { tasks }
        }
        return null
      }
    }
    break
  }
  return null
}

export interface TaskCardViewProps {
  tasks: TaskItemData[]
  /** floating: 悬浮在输入框上方（进行中） | settled: 任务完成后留在消息流内 */
  variant: 'floating' | 'settled'
  className?: string
}

/**
 * 统一定义的单任务卡片视图（支持进行中悬浮态与完成后留档态）
 */
export function TaskCardView({
  tasks,
  variant,
  className,
}: TaskCardViewProps) {
  const { t } = useTranslation('ai')
  if (!tasks.length) return null

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = completed === total
  const isFloating = variant === 'floating'

  const title = allDone
    ? t('taskCard.completedTitle', '已完成任务清单')
    : t('taskCard.title', '任务推进计划')

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        isFloating
          ? 'border-kumo-line bg-kumo-base shadow-md backdrop-blur'
          : 'my-2 border-kumo-line bg-kumo-base shadow-sm',
        className,
      )}
    >
      {/* 头部信息 */}
      <div className="flex items-center justify-between gap-2 border-b border-kumo-line pb-2.5">
        <div className="flex items-center gap-2">
          {allDone ? (
            <CheckCircleIcon size={16} className="text-kumo-success" />
          ) : (
            <ListChecksIcon size={16} className="text-kumo-brand" />
          )}
          <span className="text-xs font-semibold text-kumo-default">
            {title}
          </span>
        </div>
        <span className="font-mono text-xs text-kumo-subtle">
          {completed} / {total} ({percent}%)
        </span>
      </div>

      {/* 动态进度条 */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-kumo-recessed">
        <div
          className={cn(
            'h-full transition-all duration-300',
            allDone ? 'bg-kumo-success' : 'bg-kumo-brand',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 任务列表 */}
      <div className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {tasks.map((task) => {
          const isDone = task.status === 'completed'
          const isRunning = task.status === 'in_progress'
          const isFailed = task.status === 'failed'

          return (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
                isRunning && 'bg-kumo-elevated text-kumo-default font-medium',
                isDone && 'text-kumo-subtle line-through opacity-75',
                !isDone && !isRunning && 'text-kumo-default',
              )}
            >
              {isDone ? (
                <CheckCircleIcon
                  size={14}
                  className="shrink-0 text-kumo-success"
                />
              ) : isRunning ? (
                <CircleNotchIcon
                  size={14}
                  className="shrink-0 text-kumo-brand motion-safe:animate-spin"
                />
              ) : isFailed ? (
                <XCircleIcon size={14} className="shrink-0 text-kumo-danger" />
              ) : (
                <CircleIcon size={14} className="shrink-0 text-kumo-inactive" />
              )}
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              {isRunning ? (
                <span className="shrink-0 text-[10px] text-kumo-brand motion-safe:animate-pulse">
                  {t('taskCard.running', '进行中…')}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 悬浮在输入框上方的实时任务卡片
 */
export function AiFloatingTaskCard({ className }: { className?: string }) {
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)

  const activeData = getActiveTaskData(messages, status)
  if (!activeData) return null

  return (
    <TaskCardView
      tasks={activeData.tasks}
      variant="floating"
      className={className}
    />
  )
}
