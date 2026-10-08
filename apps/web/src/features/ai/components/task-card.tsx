import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  ListChecksIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/cn'
import { useAiSessionStore, type AiMessage } from '#/features/ai/core'
import {
  getLatestSessionTasks,
  type TaskItem as TaskItemData,
} from '#/features/ai/core/tools/task-tools'

export { getLatestSessionTasks, type TaskItemData }

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

        const allSettled = tasks.every((t) => t.status === 'completed' || t.status === 'cancelled')
        const isStreaming = status === 'streaming' && i === messages.length - 1

        // 进行中：正在流式执行且尚未全部完成 -> 悬浮在输入框上方
        if (isStreaming && !allSettled) {
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
 * 统一定义的单任务卡片视图（用于消息流内 settled 留档展示）
 */
export function TaskCardView({ tasks: rawTasks, className }: TaskCardViewProps) {
  const { t } = useTranslation('ai')
  if (!rawTasks.length) return null

  // 终态容错结算：若前置任务均已完成，末尾单项未及时打上 completed，自动结算为完成，杜绝永久卡在进行中
  const tasks = rawTasks.map((task, idx) => {
    if (
      task.status === 'in_progress' &&
      idx === rawTasks.length - 1 &&
      rawTasks.slice(0, idx).every((t) => t.status === 'completed')
    ) {
      return { ...task, status: 'completed' as const }
    }
    return task
  })

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = completed === total

  const title = allDone
    ? t('taskCard.completedTitle', '已完成任务清单')
    : t('taskCard.title', '任务推进计划')

  return (
    <div
      className={cn(
        'my-2 rounded-xl border border-kumo-line bg-kumo-base p-3 transition-all',
        className,
      )}
    >
      {/* 头部信息 */}
      <div className="flex items-center justify-between gap-2 border-b border-kumo-line pb-2.5">
        <div className="flex items-center gap-2">
          {allDone ? (
            <CheckCircleIcon size={16} className="text-kumo-subtle" />
          ) : (
            <ListChecksIcon size={16} className="text-kumo-subtle" />
          )}
          <span className="text-xs font-semibold text-kumo-default">{title}</span>
        </div>
        <span className="font-mono text-xs text-kumo-subtle">
          {completed} / {total} ({percent}%)
        </span>
      </div>

      {/* 动态进度条 */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-kumo-recessed">
        <div
          className="h-full bg-kumo-subtle transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 任务列表 */}
      <div className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {tasks.map((task) => {
          const isDone = task.status === 'completed'
          const isCancelled = task.status === 'cancelled'
          const isRunning = task.status === 'in_progress'
          const isFailed = task.status === 'failed'

          return (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
                isRunning && 'bg-kumo-elevated text-kumo-default font-medium',
                isDone && 'text-kumo-subtle line-through opacity-75',
                isCancelled && 'text-kumo-subtle line-through opacity-50',
                !isDone && !isRunning && !isCancelled && 'text-kumo-default',
              )}
            >
              {isDone ? (
                <CheckCircleIcon size={14} className="shrink-0 text-kumo-subtle" />
              ) : isRunning ? (
                <CircleNotchIcon
                  size={14}
                  className="shrink-0 text-kumo-subtle motion-safe:animate-spin"
                />
              ) : isCancelled || isFailed ? (
                <XCircleIcon size={14} className="shrink-0 text-kumo-subtle" />
              ) : (
                <CircleIcon size={14} className="shrink-0 text-kumo-inactive" />
              )}
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              {isRunning ? (
                <span className="shrink-0 text-[10px] text-kumo-subtle motion-safe:animate-pulse">
                  {t('taskCard.running', '进行中…')}
                </span>
              ) : isCancelled ? (
                <span className="shrink-0 text-[10px] text-kumo-subtle">
                  {t('taskCard.cancelled', '已取消')}
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
 * 输入框后置层叠任务卡片：与回退消息保持一致的后置底卡展示方式，
 * 支持折叠：折叠时只看进度百分比（数字完成度），展开时向上展现任务清单，图标纯色无杂色。
 */
export function AiTaskBackplate({
  tasks,
  collapsed,
  onToggleCollapsed,
}: {
  tasks: TaskItemData[]
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { t } = useTranslation('ai')
  if (!tasks.length) return null

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = completed === total

  const title = allDone
    ? t('taskCard.completedTitle', '已完成任务清单')
    : t('taskCard.title', '任务推进计划')

  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapsed}
        className="flex cursor-pointer items-start justify-between rounded-t-2xl border-t border-x border-kumo-line bg-kumo-tint px-3.5 pt-1.5 pb-4 text-xs text-kumo-subtle select-none transition-colors hover:bg-kumo-tint/80"
        title="点击展开任务清单"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[11px] font-medium text-kumo-default">{title}</span>
          <span className="font-mono text-[11px] text-kumo-subtle">
            {completed}/{total} ({percent}%)
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapsed()
          }}
          className="ms-2 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle transition-colors hover:bg-kumo-fill hover:text-kumo-default"
          aria-label="展开任务清单"
        >
          <CaretDownIcon size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-t-2xl border-t border-x border-kumo-line bg-kumo-tint px-3.5 pt-2 pb-5 text-xs text-kumo-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-kumo-line/60 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[11px] font-medium text-kumo-default">{title}</span>
          <span className="font-mono text-[11px] text-kumo-subtle">
            {completed}/{total} ({percent}%)
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle transition-colors hover:bg-kumo-fill hover:text-kumo-default"
          aria-label="折叠任务清单"
          title="折叠任务清单"
        >
          <CaretUpIcon size={12} />
        </button>
      </div>

      {/* 动态进度条（纯色） */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-kumo-recessed">
        <div
          className="h-full bg-kumo-subtle transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 展开的任务列表 */}
      <div className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
        {tasks.map((task) => {
          const isDone = task.status === 'completed'
          const isCancelled = task.status === 'cancelled'
          const isRunning = task.status === 'in_progress'

          return (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-2 rounded px-1.5 py-1 text-[11px] transition-colors',
                isRunning && 'bg-kumo-elevated text-kumo-default font-medium',
                isDone && 'text-kumo-subtle line-through opacity-70',
                isCancelled && 'text-kumo-subtle line-through opacity-50',
                !isDone && !isRunning && !isCancelled && 'text-kumo-default',
              )}
            >
              {isDone ? (
                <CheckCircleIcon size={13} className="shrink-0 text-kumo-subtle" />
              ) : isRunning ? (
                <CircleNotchIcon
                  size={13}
                  className="shrink-0 text-kumo-subtle motion-safe:animate-spin"
                />
              ) : isCancelled ? (
                <XCircleIcon size={13} className="shrink-0 text-kumo-subtle" />
              ) : (
                <CircleIcon size={13} className="shrink-0 text-kumo-inactive" />
              )}
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              {isRunning ? (
                <span className="shrink-0 text-[10px] text-kumo-subtle motion-safe:animate-pulse">
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
 * 悬浮在输入框上方的实时任务卡片（兼容保留导出）
 */
export function AiFloatingTaskCard({ className }: { className?: string }) {
  const [collapsed, setCollapsed] = useState(true)
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)

  const activeData = getActiveTaskData(messages, status)
  if (!activeData) return null

  return (
    <div className={cn('relative w-full', collapsed ? 'pt-7.5' : 'pt-48', className)}>
      <AiTaskBackplate
        tasks={activeData.tasks}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
      />
    </div>
  )
}
