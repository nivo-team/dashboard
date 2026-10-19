import { Collapsible } from '@cloudflare/kumo'
import {
  CaretDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { MarkdownContent } from '#/features/ai/markdown/content'
import { TaskCardView } from '#/features/ai/components/task-card'
import type { AiMessagePart } from '#/features/ai/core'
import { usePreferencesStore } from '#/lib/store'
import { cn } from '#/lib/cn'
import { formatToolValue } from './format'
import { readManageTasks } from './message-parts'
import { NavProposalCard } from './approval-card'
import { ReasoningPartView } from './reasoning-part'

/** 展开后的一段详情（参数 / 结果 / 错误共用）。 */
function ToolDetailSection({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: unknown
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'text-xs font-medium',
          tone === 'danger' ? 'text-kumo-danger' : 'text-kumo-subtle',
        )}
      >
        {label}
      </span>
      {/*
        `max-h` + 滚动：工具输出可能是整页 JSON，不能让它把会话撑爆；
        `whitespace-pre-wrap` 保证长行换行而不是横向溢出。
      */}
      <pre className="max-h-48 overflow-auto rounded-md bg-kumo-tint p-2 text-xs whitespace-pre-wrap text-kumo-default">
        {formatToolValue(value)}
      </pre>
    </div>
  )
}

/**
 * 助手消息里的**一个 part**：文字 / 思考链 / 跳转建议卡 / 任务卡 / 工具卡。
 *
 * 五件事刻意**不受「显示详细信息」影响**（那道门只管工具卡与 token 用量）：
 * - **审批卡**：写操作的确认是必须的交互（在 `AiConversation` 里独立渲染），不是"输出"；
 * - **任务规划卡（manage_tasks）**：多任务推进的核心进度回显，始终展示；
 * - **跳转建议卡**：它是一次交互，不是"输出"（用户去页面的唯一入口）；
 * - **思考链**：它是"这一轮在干什么"的实时回显；
 * - **「正在思考…」**：工具执行期间 `status` 仍是 `streaming`，所以即使看不到工具卡片，
 *   页面也仍在动，不会显得卡死。
 *
 * 任务卡的三条规则（与 `message-parts` 里的判定一一对应）：
 * 1. 整个任务流只保留一个卡片（同一消息内只保留最后一个 `manage_tasks`）；
 * 2. 任务进行中时，由输入框上方的悬浮卡片展示，此处静默；
 * 3. 任务结束时，在此处留下静态 settled 的 Todo 卡片，展示完成状态。
 */
export function AssistantPart({
  part,
  streaming,
  isLastManageTasks,
  isFloatingTask,
}: {
  part: AiMessagePart
  streaming: boolean
  isLastManageTasks?: boolean
  isFloatingTask?: boolean
}) {
  const { t } = useTranslation('ai')
  const showDetails = usePreferencesStore((state) => state.aiShowDetails)

  if (part.type === 'text') {
    if (!part.text.trim()) return null
    return <MarkdownContent text={part.text} streaming={streaming} />
  }

  if (part.type === 'reasoning') {
    return <ReasoningPartView part={part} />
  }

  /*
    全屏的跳转建议卡：与审批卡一样**不受「显示详细信息」影响** —— 它是一次交互，
    不是"输出"。放在 `showDetails` 那道门之前，正是为了别被它拦掉。
  */
  if (part.type === 'nav-proposal') {
    return <NavProposalCard part={part} />
  }

  if (part.type === 'tool-call' && part.toolName === 'manage_tasks') {
    if (!isLastManageTasks || isFloatingTask) return null
    const tasks = readManageTasks(part)
    if (!tasks.length) return null

    return <TaskCardView tasks={tasks} variant="settled" />
  }

  if (part.type !== 'tool-call' || !showDetails) return null

  const Icon =
    part.state === 'running'
      ? CircleNotchIcon
      : part.state === 'error'
        ? WarningCircleIcon
        : CheckCircleIcon

  const statusLabel =
    part.state === 'running'
      ? t('toolRunning', '执行中')
      : part.state === 'error'
        ? t('toolFailed', '失败')
        : t('toolDone', '完成')

  return (
    /*
      卡片要**自己的底色**：面板的点阵背景会从没有底色的元素后面透出来。
      取 `bg-kumo-base`（与面板同色）而不是 `bg-kumo-control` —— 后者是审批卡用的，
      那张卡承载"要不要执行写操作"的重要决定，应当比这张信息卡更突出。
      展开面板在 Root 内部，会自然继承这层底色。
    */
    <Collapsible.Root className="rounded-lg border border-kumo-line bg-kumo-base">
      {/*
        整行都是触发区：这一行本来就没有别的东西可点，不必再单画一个小箭头按钮。
        `Collapsible.Trigger` 自己渲染成 button（键盘、`aria-expanded` 都由 Base UI 管），
        所以箭头用 `group-aria-expanded:` 跟着转 —— 比去猜它的 data 属性名可靠。
      */}
      <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-start text-xs">
        <Icon
          size={13}
          className={
            part.state === 'running'
              ? 'shrink-0 text-kumo-subtle motion-safe:animate-spin'
              : part.state === 'error'
                ? 'shrink-0 text-kumo-danger'
                : 'shrink-0 text-kumo-success'
          }
        />
        <span className="min-w-0 truncate text-kumo-default">
          {t(`tools.${part.toolName}`, part.toolName)}
        </span>
        <span className="ms-auto shrink-0 text-kumo-subtle">{statusLabel}</span>
        {/* 上下向图标，不镜像；只在展开时转半圈 */}
        <CaretDownIcon
          size={12}
          className="shrink-0 text-kumo-subtle transition-transform group-aria-expanded:rotate-180 motion-safe:duration-200"
        />
      </Collapsible.Trigger>

      <Collapsible.Panel className="border-t border-kumo-line px-2.5 py-2">
        <div className="flex flex-col gap-2">
          <ToolDetailSection label={t('toolDetail.input', '参数')} value={part.input} />
          {part.error ? (
            <ToolDetailSection
              label={t('toolDetail.error', '错误')}
              value={part.error}
              tone="danger"
            />
          ) : null}
          {part.output !== undefined ? (
            <ToolDetailSection label={t('toolDetail.output', '结果')} value={part.output} />
          ) : null}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
