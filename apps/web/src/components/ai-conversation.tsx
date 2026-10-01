import { Button, Collapsible } from '@cloudflare/kumo'
import {
  BrainIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  FileIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/components/ai-bot-avatar'
import { MarkdownContent } from '#/components/markdown-content'
import { useAuthStore } from '#/lib/auth'
import { cn } from '#/lib/cn'
import {
  getAiShellBridge,
  isDocumentReload,
  resolveAiApproval,
  useAiSessionStore,
  type AiMessage,
  type AiMessagePart,
  type PendingApproval,
} from '#/lib/ai'
import { usePreferencesStore } from '#/lib/store'
import { useTimezone } from '#/lib/timezone'
import { TaskCardView, type TaskItemData } from '#/components/ai-task-card'

/**
 * 会话区：把 store 里的消息渲染出来，并处理三种「还没内容」的状态。
 *
 * 三种空态依次是：
 * - **没配模型** → 一枚睡着的头像 + 去设置页的入口（这是唯一一条正确的下一步，
 *   不要写成「暂无数据」）；
 * - **配好了但还没聊** → 一枚放大的头像 + 一句按时段变的问候；
 * - **正在跑** → 底部一行「正在思考…」，工具执行态则由消息里的工具卡片如实表达。
 *
 * 前两种空态用的是**同一枚头像**（跟着同一个设置走），只有状态与尺寸不同 ——
 * 于是「还没配好」与「刚打开」看到的是同一个角色，而不像两个不同的功能。
 *
 * 工具卡片的状态**来自真实事件**（`tool-call` / `tool-result` / `tool-error`），
 * 不是计时器演的动画 —— 这样「卡在某个工具上」一眼就能看出来。
 */
/** 问候语的兜底文案（i18n 缺失时用），键与 `greetings.*` 对应 */
const GREETING_FALLBACK = {
  morning: '早上好。',
  afternoon: '下午好。',
  evening: '晚上好。',
} as const

type GreetingKey = keyof typeof GREETING_FALLBACK

/**
 * 按时段选问候语。
 *
 * 用**用户选的时区**（设置 → 外观 → 时区）而不是碰巧的本机时区：这个后台里
 * 「现在几点」处处以那个设置为准（时间列、相对时间），问候语没理由例外 ——
 * 否则用户把时区设成纽约、人坐在北京，会话区说「晚上好」而列表里全是上午的时间。
 *
 * `hourCycle: 'h23'` 是必须的：`hour12: false` 在午夜会给出 "24" 而不是 "0"。
 */
function greetingKeyOf(iana: string): GreetingKey {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  )

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * 把工具的参数 / 结果格式化成**能读的文本**。
 *
 * 对象走带缩进的 `JSON.stringify` —— 这是给人排查用的，缩进比紧凑有用得多；
 * 字符串原样（工具返回的那些"说明句"不该被加上引号与转义）；其余交给 `String()`。
 */
function formatToolValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // 循环引用之类：JSON.stringify 会抛，退回最朴素的表示，别让展示把会话搞崩
    return String(value)
  }
}

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

export interface AiConversationProps {
  /**
   * 是否由本组件自己触发 `loadHistory`，默认 `true`（AI 面板）。
   *
   * 全屏对话页（`/$appId_.sphere`）传 `false`：那一页的**会话由路由决定**
   * （`sphere/` = 新会话、`sphere/chat/$chatId` = 指定会话），会话列表由布局统一加载。
   * 两边都调 `loadHistory` 的话，它的「恢复上次会话」会和路由的会话选择互相覆盖。
   */
  manageHistory?: boolean
}

export function AiConversation({ manageHistory = true }: AiConversationProps) {
  const { t } = useTranslation('ai')
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)
  const error = useAiSessionStore((state) => state.error)
  const pendingApproval = useAiSessionStore((state) => state.pendingApproval)
  const loadHistory = useAiSessionStore((state) => state.loadHistory)
  /*
    这里原有一个「还没配置模型服务」的空态（配一个「去设置」按钮）—— 走中间层后
    **前端不再需要配置模型**（模型与凭证都在服务端），它只会挡住本来能用的用户，已删除。
    服务端不可用的情况由发送失败后的 `status === 'error'` 展示承担。
  */
  // 会话按 app 分区存 IDB，所以切换应用要换一批历史
  const appId = useAuthStore((state) => state.currentApp?.id ?? null)
  // 空态问候语按用户设置的时区判断时段（不是本机时区）
  const { timezoneMeta } = useTimezone()
  // 「新会话时机」（见下面的 loadHistory）
  const sessionMode = usePreferencesStore((state) => state.aiSessionMode)

  /*
    进入面板（以及切换应用）时加载该 app 的会话历史。
    `loadHistory` 内部对「同一个 app 已经加载过」会早退 —— 面板关掉再打开是一次重挂载，
    没有那道判断就会用 IDB 里的旧版本覆盖掉流式回复已经吐出来的增量。

    `fresh` 只在**本次页面载入是重新载入**（刷新页面 / 新标签页，见 `isDocumentReload`）
    并且设置里选了「刷新后新会话」时成立：列表照常加载、但不恢复上次那段，直接落在空的
    新会话上。同一份文档里关掉面板再打开不算重新载入，当前会话原样留着 —— **不必**在
    面板打开的那一刻清内存（旧实现在打开上升沿调 `startNewSession()`，那与「同一页面内
    接着上一段说」是矛盾的）。
  */
  useEffect(() => {
    if (!manageHistory) return
    void loadHistory({ fresh: sessionMode === 'new' && isDocumentReload() })
  }, [appId, loadHistory, sessionMode, manageHistory])

  // 时段问候只用在空态，但放在这里算也行（一次 Intl 调用，可忽略）
  const greetingKey = greetingKeyOf(timezoneMeta.iana)

  if (messages.length === 0) {
    /*
      新对话的空态：一枚**放大的 AI 形象** + 一句按时段变的问候。
      头像就是会话里那个（同一个设置、同一个形状），只是大一号 —— 于是
      「刚打开」和「正在聊」看到的是同一个角色，而不是两个不同的图标。

      问候语加粗用 `font-semibold`（本仓库禁用 `font-bold`），字号 16px（`text-base`）
      按 Kumo 规范属于标题档。
    */
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <AiBotAvatar size={96} />

        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-kumo-default">
            {t(`greetings.${greetingKey}`, GREETING_FALLBACK[greetingKey])}
          </p>
          <p className="max-w-64 text-sm text-kumo-subtle">
            {t('greetingPrompt', '今天想做点什么？')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <AiMessageView
          key={message.id}
          message={message}
          /*
            只有**最后一条**消息在流式中（`status === 'streaming'`）时才走纯文本降级；
            之前那些消息都已经定稿，直接渲染 Markdown。
          */
          streaming={
            status === 'streaming' && message.id === messages[messages.length - 1]?.id
          }
          pendingApproval={pendingApproval !== null}
        />
      ))}

      {/*
        等待确认时展示审批卡；不再在下方冗余渲染带有 20px 小头像的「正在思考…」，
        思考状态已内聚到当前助手消息内部渲染，保持头像单一且连贯。
      */}
      {pendingApproval ? <ApprovalCard approval={pendingApproval} /> : null}

      {error ? (
        <p className="rounded-lg bg-kumo-danger-tint px-3 py-2 text-xs text-kumo-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** token 数的紧凑写法（1234 → 1.2K）—— 只用于那一行元信息，不追求精确。 */
function formatTokenCount(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function AiMessageView({
  message,
  streaming,
  pendingApproval = false,
}: {
  message: AiMessage
  streaming: boolean
  pendingApproval?: boolean
}) {
  const outputMode = usePreferencesStore((state) => state.aiOutputMode)
  const showToolCalls = usePreferencesStore((state) => state.aiShowToolCalls)
  const { t } = useTranslation('ai')

  if (message.role === 'user') {
    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
    /*
      用户消息里除了文字还有**附件**，分两类渲染（另有旧存档的 `image` part）：
      - 图片：按原图比例预览、限制最大高度；
      - 文本文件（md / txt）：一张只读卡片（图标 + 文件名）—— 内容已经作为文本发给模型，
        不在气泡里铺开。
      只发附件不打字时也只渲染附件那一块（`gap-2` 在没有文字时不会留下空档）。
    */
    const imageParts = message.parts.filter(
      (
        part,
      ): part is
        | Extract<AiMessagePart, { type: 'image' }>
        | (Extract<AiMessagePart, { type: 'attachment' }> & { kind: 'image' }) =>
        part.type === 'image' ||
        (part.type === 'attachment' && part.kind === 'image'),
    )
    const textFileParts = message.parts.filter(
      (
        part,
      ): part is Extract<AiMessagePart, { type: 'attachment' }> & { kind: 'text' } =>
        part.type === 'attachment' && part.kind === 'text',
    )
    return (
      <div className="flex flex-col items-end gap-2">
        {imageParts.length > 0 || textFileParts.length > 0 ? (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {imageParts.map((image, index) => (
              <img
                key={`${message.id}-image-${index}`}
                src={image.url}
                alt={image.name ?? t('attachmentPreview', '待发送的附件')}
                className="max-h-40 rounded-xl ring-1 ring-kumo-line"
              />
            ))}
            {textFileParts.map((file, index) => (
              <span
                key={`${message.id}-file-${index}`}
                className="flex max-w-64 items-center gap-2 rounded-xl bg-kumo-tint px-3 py-2 ring-1 ring-kumo-line"
              >
                <FileIcon size={18} className="shrink-0 text-kumo-subtle" />
                <span className="truncate text-xs text-kumo-default">{file.name}</span>
              </span>
            ))}
          </div>
        ) : null}
        {text ? (
          <p className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-kumo-tint px-3 py-2 text-sm text-kumo-default">
            {text}
          </p>
        ) : null}
      </div>
    )
  }

  /*
    助手消息渲染逻辑：
    1. 判断是否有可见的文字输出：
       - `stream` 模式下，检查是否已有非空的 text part；
       - `wait` 模式下，流式期间文字一律隐藏（直到流式结束再一次性展示）。
    2. 判断是否有任何可见内容（文字，或在开启「显示工具调用」时的工具卡片）。
    3. 「正在思考…」：当处于流式传输中（streaming）、尚未产出可见文字、且没有等待审批卡时，
       直接在**本条助手消息右侧**呈现 —— 头像在左、思考在右，浑然一体。
       不再在消息列表底部用单独的 20px 小头像重复渲染第二遍（彻底解决出现两个头像：
       一个占着空白框、另一个在底下转圈的问题）。
    4. 若既无可见内容、也不处于思考状态（例如工具被隐藏且正在等审批，或异常中断未输出任何内容），
       则整条消息不渲染，绝不在屏幕上留下一个占据空白的空头像。
  */
  const hasVisibleText =
    (outputMode === 'stream' || !streaming) &&
    message.parts.some(
      (part) => part.type === 'text' && part.text.trim().length > 0,
    )

  const isCurrentlyReasoning = message.parts.some(
    (part) => part.type === 'reasoning' && part.state === 'streaming',
  )

  const showThinking =
    streaming && !hasVisibleText && !isCurrentlyReasoning && !pendingApproval

  // 查找该消息内最后一个 manage_tasks 工具调用的索引
  let lastManageTasksIndex = -1
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const p = message.parts[i]
    if (p.type === 'tool-call' && p.toolName === 'manage_tasks') {
      lastManageTasksIndex = i
      break
    }
  }

  // 判定该 manage_tasks 是否正在运行中并在输入框上方悬浮
  const isTaskFloatingNow = (part: AiMessagePart) => {
    if (part.type !== 'tool-call' || part.toolName !== 'manage_tasks') return false
    const rawInput = part.input as { tasks?: TaskItemData[] } | undefined
    const rawOutput = part.output as { tasks?: TaskItemData[] } | undefined
    const tasks = rawOutput?.tasks || rawInput?.tasks || []
    if (tasks.length === 0) return false
    const allCompleted = tasks.every((t) => t.status === 'completed')
    return streaming && !allCompleted
  }

  const hasVisibleParts = message.parts.some((part, index) => {
    if (part.type === 'text') {
      return (outputMode === 'stream' || !streaming) && part.text.trim().length > 0
    }
    if (part.type === 'reasoning') {
      return part.text.trim().length > 0 || part.state === 'streaming'
    }
    /*
      全屏的跳转建议卡**永远算可见内容**：它是用户"去页面"的唯一入口，
      不能被「显示工具调用」这个偏好关掉；也只有它在的消息不该因为"没有文字"而整条不渲染。
    */
    if (part.type === 'nav-proposal') return true
    if (part.type === 'tool-call') {
      if (part.toolName === 'manage_tasks') {
        return index === lastManageTasksIndex && !isTaskFloatingNow(part)
      }
      return showToolCalls
    }
    return false
  })

  if (!hasVisibleParts && !showThinking) return null

  return (
    <div className="flex gap-2">
      {/*
        AI 的小机器人头像：形状来自 设置 → AI（默认 clover）。只给助手消息戴 ——
        它代表的是「AI 这个人」，用户那侧不戴。
        `state` 跟着真实状态走：正在生成的那一条是 `working`（跳跃旋转），
        其余已定稿的消息是 `default`（四处张望）。
      */}
      <AiBotAvatar
        size={28}
        state={streaming ? 'working' : 'default'}
        className="mt-0.5 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {message.parts.map((part, index) => {
          if (part.type === 'text' && outputMode === 'wait' && streaming) {
            return null
          }
          return (
            <AssistantPart
              key={`${message.id}-${index}`}
              part={part}
              // 只有最后一个 part 可能还在增长，也就只有它需要纯文本降级
              streaming={streaming && index === message.parts.length - 1}
              isLastManageTasks={index === lastManageTasksIndex}
              isFloatingTask={isTaskFloatingNow(part)}
            />
          )
        })}

        {showThinking ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-kumo-subtle">
            {t('thinking', '正在思考…')}
          </div>
        ) : null}

        {/*
          本轮 token 用量（定稿后才有，流式期间拿不到）。
          **`cache` 是「提示词拼接是否对齐」的唯一客观证据**：它偏低就说明前缀被改动了
          （时间戳、历史被改写、拼接顺序抖动…）—— 见 .agents/docs/ai-server-layer.md §7.5 / §7.6。
        */}
        {!streaming && message.usage ? (
          <p className="text-xs text-kumo-subtle">
            {t('usageStats', {
              cache: formatTokenCount(message.usage.cacheReadTokens),
              input: formatTokenCount(message.usage.inputTokens),
              output: formatTokenCount(message.usage.outputTokens),
            })}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function AssistantPart({
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
  /*
    工具调用的可见性由 设置 → AI 控制、**默认关**：普通用户只关心回答内容，
    不需要知道中间调了哪个工具。关掉时整张卡片都不渲染。

    两件事刻意**不受它影响**：
    - **审批卡**：写操作的确认是必须的交互（在 `AiConversation` 里独立渲染），不是"输出"；
    - **任务规划卡（manage_tasks）**：多任务推进的核心进度回显，始终展示；
    - **「正在思考…」**：工具执行期间 `status` 仍是 `streaming`，所以即使看不到工具卡片，
      页面也仍在动，不会显得卡死。
  */
  const showToolCalls = usePreferencesStore((state) => state.aiShowToolCalls)

  if (part.type === 'text') {
    if (!part.text.trim()) return null
    return <MarkdownContent text={part.text} streaming={streaming} />
  }

  if (part.type === 'reasoning') {
    return <ReasoningPartView part={part} />
  }

  /*
    全屏的跳转建议卡：与审批卡一样**不受「显示工具调用」影响** —— 它是一次交互，
    不是"输出"。放在 `showToolCalls` 那道门之前，正是为了别被它拦掉。
  */
  if (part.type === 'nav-proposal') {
    return <NavProposalCard part={part} />
  }

  // 任务规划卡（manage_tasks）的处理原则：
  // 1. 整个任务流只保留一个卡片（同一消息内只保留最后一个 manage_tasks）；
  // 2. 任务进行中时，由输入框上方的悬浮卡片展示，此处静默；
  // 3. 任务结束时，在此处留下静态 settled 的 Todo 卡片，展示完成状态。
  if (part.type === 'tool-call' && part.toolName === 'manage_tasks') {
    if (!isLastManageTasks || isFloatingTask) return null
    const rawInput = part.input as { tasks?: TaskItemData[] } | undefined
    const rawOutput = part.output as { tasks?: TaskItemData[] } | undefined
    const tasks = rawOutput?.tasks || rawInput?.tasks || []
    if (!tasks.length) return null

    return <TaskCardView tasks={tasks} variant="settled" />
  }

  if (part.type !== 'tool-call' || !showToolCalls) return null

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

/**
 * 写操作 / 跳转的审批卡 —— 整个「人工审批」规则的**用户侧落点**。
 *
 * 工具的执行挂在 `chat.ts` 的 Promise 上：这里点了按钮，那边才继续（或不继续）。
 * 因此三件事必须同时成立：
 * - **参数原样展示**：用户要能看清到底要发什么（method / path / body 一个都不能藏）；
 * - **默认不放行**：没有点「允许」就永远停在 `await`，不存在超时自动执行；
 * - **三态可选**：`once`（只这一次）/ `session`（本会话不再询问，写会话级授权，
 *   刷新失效）/ `deny`（拒绝）。调研参考了 fx.sh 的会话级 grant ——
 *   写操作的免确认不该跨会话保留。
 *   ⚠️ 「允许一次」**真的只放行一次**：`once` 不写任何授权（早期实现顺手写进了内存授权表，
 *   于是标签写"一次"、行为是"本会话"，被这个三态修掉了）。
 *
 * ## 跳转形态（`kind === 'navigate'`）
 *
 * 跳转也走这条通道，但**卡片形状与语义不同**：给用户看的不是 `{path}` 这种原始 JSON，
 * 而是「页面名 + 路径 + 理由」；按钮是**三选一**：
 * - **带我去** = 只放行这一次（`once`，不写授权）→ 立即跳，下次还问；
 * - **本会话自动跳转** = 放行 + 记住（`session`）→ 写 `NAVIGATION_GRANT`，本会话内不再问；
 * - **先不跳** = 拒绝（工具会抛错，模型据此改用就地渲染 / 换个目标 / 反问）。
 *
 * 询问模式下才有这张卡：**自动模式 = 始终允许**，`navigate_to` 直接跳、根本不发请求。
 */
function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const { t } = useTranslation('ai')

  if (approval.kind === 'navigate') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
        <p className="text-sm font-medium text-kumo-default">
          {t('navConfirmTitle', '要带你去这个页面吗？')}
        </p>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-kumo-default">{approval.label}</span>
          <span className="font-mono text-xs text-kumo-subtle">
            {approval.path}
            {approval.reason ? ` · ${approval.reason}` : ''}
          </span>
        </div>
        <p className="text-xs text-kumo-subtle">
          {t(
            'navConfirmHint',
            '选「本会话自动跳转」后，本次对话里不再询问。',
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => resolveAiApproval(approval.id, 'once')}
          >
            {t('navConfirmGo', '带我去')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resolveAiApproval(approval.id, 'session')}
          >
            {t('navConfirmSession', '本会话自动跳转')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolveAiApproval(approval.id, 'deny')}
          >
            {t('navConfirmSkip', '先不跳')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
      <p className="text-sm font-medium text-kumo-default">
        {t('approvalTitle', '这个操作需要你确认')}
      </p>
      <p className="text-xs text-kumo-subtle">
        {t(`tools.${approval.toolName}`, approval.toolName)}
        {approval.reason ? ` · ${approval.reason}` : ''}
      </p>

      <pre className="max-h-40 overflow-auto rounded-lg bg-kumo-base p-2 font-mono text-xs text-kumo-default">
        {formatApprovalInput(approval.input)}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => resolveAiApproval(approval.id, 'once')}
        >
          {t('approve', '允许一次')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => resolveAiApproval(approval.id, 'session')}
        >
          {t('approveAlways', '本会话不再询问')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resolveAiApproval(approval.id, 'deny')}
        >
          {t('deny', '拒绝')}
        </Button>
      </div>
    </div>
  )
}

/**
 * **全屏的跳转建议卡**（`nav-proposal` part）。
 *
 * 与面板的确认卡最根本的差别是**不阻塞**：工具早就返回了（AI 这一轮已经跑完，
 * 数据也渲染在下面），所以这张卡只是"要不要去真正的页面看"的入口，随时可点、也可不点。
 * 因此它是消息的一部分（落盘、刷新后还在），而不是一个挂起的 Promise。
 *
 * 跳转走外壳桥（与工具层同一条路）：两个容器都注册了桥，所以这里不需要 router 依赖。
 */
function NavProposalCard({
  part,
}: {
  part: Extract<AiMessagePart, { type: 'nav-proposal' }>
}) {
  const { t } = useTranslation('ai')
  const resolveNavProposal = useAiSessionStore((state) => state.resolveNavProposal)

  const go = () => {
    resolveNavProposal(part.id, 'accepted')
    getAiShellBridge()?.navigate(part.path)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
      <p className="text-sm font-medium text-kumo-default">
        {t('navProposalTitle', '需要去页面查看吗？')}
      </p>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-kumo-default">{part.label}</span>
        <span className="font-mono text-xs text-kumo-subtle">
          {part.path}
          {part.reason ? ` · ${part.reason}` : ''}
        </span>
      </div>

      {part.state === 'accepted' ? (
        <p className="text-xs text-kumo-subtle">
          {t('navProposalAccepted', '已打开该页面。')}
        </p>
      ) : part.state === 'dismissed' ? (
        <p className="text-xs text-kumo-subtle">
          {t('navProposalDismissed', '已留在对话里。')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={go}>
            {t('navProposalGo', '带我去')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolveNavProposal(part.id, 'dismissed')}
          >
            {t('navProposalDismiss', '不用了')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 审批参数展示：JSON 化失败就退回字符串，绝不因为格式化失败而把卡片弄成空白。 */
function formatApprovalInput(input: unknown): string {
  try {
    const text = JSON.stringify(input, null, 2)
    return typeof text === 'string' ? text : String(input)
  } catch {
    return String(input)
  }
}

/**
 * 思考链（Reasoning / Chain of thought）卡片。
 *
 * 遵循 AI SDK / AI Elements 的折叠与自动收起规范：
 * - 默认状态与历史会话：默认保持折叠（Collapsed），不侵占会话主视觉；
 * - 流式思考中：自动临时展开，实时呈现思考动态与脉冲；
 * - 思考结束：自动平滑折叠收起（Auto-close），把空间留给正式回答；
 * - 用户随时可点击 Trigger 自由展开或重新收起查看完整思考链路；
 * - 纯色语义令牌适配深浅色模式，禁用 dark: 变体。
 */
function ReasoningPartView({
  part,
}: {
  part: Extract<AiMessagePart, { type: 'reasoning' }>
}) {
  const { t } = useTranslation('ai')
  const isStreaming = part.state === 'streaming'

  // 按照 AI SDK 约束：默认保持折叠，仅在流式生成中动态展开
  const [isOpen, setIsOpen] = useState(isStreaming)
  const hasEverStreamedRef = useRef(isStreaming)
  const hasAutoClosedRef = useRef(false)

  // 1. 流式思考开始时展开
  useEffect(() => {
    if (isStreaming) {
      hasEverStreamedRef.current = true
      setIsOpen(true)
    }
  }, [isStreaming])

  // 2. 按照 AI SDK 规范：流式思考结束时，自动平滑折叠收起
  useEffect(() => {
    if (
      hasEverStreamedRef.current &&
      !isStreaming &&
      isOpen &&
      !hasAutoClosedRef.current
    ) {
      const timer = setTimeout(() => {
        setIsOpen(false)
        hasAutoClosedRef.current = true
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [isStreaming, isOpen])

  if (!part.text.trim() && !isStreaming) return null

  const title = isStreaming
    ? t('reasoningThinking', '深度思考中…')
    : t('reasoningTitle', '思考过程')

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-lg border border-kumo-line bg-kumo-tint/30"
    >
      <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-start text-xs transition-colors hover:bg-kumo-tint/50">
        {isStreaming ? (
          <CircleNotchIcon
            size={13}
            className="shrink-0 text-kumo-subtle motion-safe:animate-spin"
          />
        ) : (
          <BrainIcon size={13} className="shrink-0 text-kumo-subtle" />
        )}
        <span className="min-w-0 truncate font-medium text-kumo-subtle">
          {title}
        </span>
        <CaretDownIcon
          size={12}
          className="ms-auto shrink-0 text-kumo-subtle transition-transform group-aria-expanded:rotate-180 motion-safe:duration-200"
        />
      </Collapsible.Trigger>

      <Collapsible.Panel className="border-t border-kumo-line px-2.5 py-2">
        <div className="max-h-60 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-kumo-subtle">
          {part.text}
          {isStreaming ? (
            <span className="ms-0.5 inline-block h-3 w-1.5 align-middle bg-kumo-subtle motion-safe:animate-pulse" />
          ) : null}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
