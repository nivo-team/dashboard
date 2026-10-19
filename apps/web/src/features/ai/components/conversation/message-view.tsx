import { Tooltip } from '@cloudflare/kumo'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'
import type { AiMessage } from '#/features/ai/core'
import { usePreferencesStore } from '#/lib/store'
import { AssistantPart } from './assistant-part'
import { formatTokenCount } from './format'
import {
  collectText,
  findLastManageTasksIndex,
  hasVisibleText,
  isPartVisible,
  isReasoningStreaming,
  isTaskFloating,
  shouldShowThinking,
} from './message-parts'
import { RelativeTimeTooltip } from './relative-time'
import { useCopy } from './use-copy'
import { UserMessage } from './user-message'

/**
 * 一条消息（按角色分发）。
 *
 * ## 助手消息的渲染规则（都在 `message-parts` 里，这里只落 JSX）
 *
 * 1. 判断是否有可见的文字输出：`stream` 模式下检查是否已有非空的 text part；
 *    `wait` 模式下流式期间文字一律隐藏（直到流式结束再一次性展示）；
 * 2. 判断是否有任何可见内容（文字，或在开启「显示详细信息」时的工具卡片）；
 * 3. 「正在思考…」：处于流式传输中、尚未产出可见文字、且没有等待审批卡时，
 *    直接在**本条助手消息右侧**呈现 —— 头像在左、思考在右，浑然一体。
 *    不在消息列表底部用单独的 20px 小头像重复渲染第二遍（那会出现两个头像：
 *    一个占着空白框、另一个在底下转圈）；
 * 4. 若既无可见内容、也不处于思考状态（例如工具被隐藏且正在等审批，
 *    或异常中断未输出任何内容），则整条消息不渲染，绝不在屏幕上留下占据空白的空头像。
 */
export function AiMessageView({
  message,
  streaming,
  pendingApproval = false,
}: {
  message: AiMessage
  streaming: boolean
  pendingApproval?: boolean
}) {
  const outputMode = usePreferencesStore((state) => state.aiOutputMode)
  const showDetails = usePreferencesStore((state) => state.aiShowDetails)
  const { t } = useTranslation('ai')

  if (message.role === 'user') {
    return <UserMessage message={message} streaming={streaming} />
  }

  const assistantText = collectText(message.parts)
  const { copied, copy } = useCopy(assistantText)

  const visibleText = hasVisibleText(message.parts, { outputMode, streaming })
  const reasoningStreaming = isReasoningStreaming(message.parts)
  const showThinking = shouldShowThinking({
    streaming,
    hasVisibleText: visibleText,
    reasoningStreaming,
    pendingApproval,
  })

  const lastManageTasksIndex = findLastManageTasksIndex(message.parts)
  const hasVisibleParts = message.parts.some((part, index) =>
    isPartVisible(part, index, { outputMode, streaming, showDetails, lastManageTasksIndex }),
  )

  if (!hasVisibleParts && !showThinking) return null

  const showAssistantActions = !streaming && (assistantText.length > 0 || Boolean(message.createdAt))

  return (
    <div className="flex gap-2">
      {/*
        AI 的小机器人头像：形状来自 设置 → AI（默认 clover）。只给助手消息戴 ——
        它代表的是「AI 这个人」，用户那侧不戴。
        `state` 跟着真实状态走：正在生成的那一条是 `working`（跳跃旋转），
        其余已定稿的消息是 `default`（四处张望）。
      */}
      <AiBotAvatar size={28} state={streaming ? 'working' : 'default'} className="mt-0.5 shrink-0" />
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
              isFloatingTask={isTaskFloating(part, streaming)}
            />
          )
        })}

        {showThinking ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-kumo-subtle">
            {t('thinking', '正在思考…')}
          </div>
        ) : null}

        {/*
          本轮 token 用量（定稿后才有，流式期间拿不到）—— 它属于「详细信息」，
          与工具卡片**同一个开关**（默认关）：普通用户不关心 token 账，
          要看"缓存命中率"的人本来就在排查问题，那时自然会把这个开关打开。
        */}
        {showDetails && !streaming && message.usage ? (
          <p className="text-xs text-kumo-subtle">
            {t('usageStats', {
              cache: formatTokenCount(message.usage.cacheReadTokens),
              input: formatTokenCount(message.usage.inputTokens),
              output: formatTokenCount(message.usage.outputTokens),
            })}
          </p>
        ) : null}

        {/* 助手消息操作栏：复制(纯图标+Tooltip), AI回复时间(相对时间+Tooltip纯时间) */}
        {showAssistantActions ? (
          <div className="flex items-center gap-2 pt-0.5 text-xs text-kumo-subtle">
            {assistantText ? (
              <Tooltip content={copied ? t('copied', '已复制') : t('copy', '复制')}>
                <button
                  type="button"
                  onClick={copy}
                  aria-label={copied ? t('copied', '已复制') : t('copy', '复制')}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-none"
                >
                  {copied ? (
                    <CheckIcon size={13} weight="bold" className="text-kumo-success" />
                  ) : (
                    <CopyIcon size={13} />
                  )}
                </button>
              </Tooltip>
            ) : null}

            {message.createdAt ? <RelativeTimeTooltip value={message.createdAt} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
