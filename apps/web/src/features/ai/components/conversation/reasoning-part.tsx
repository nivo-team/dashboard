import { Collapsible } from '@cloudflare/kumo'
import { BrainIcon, CaretDownIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiMessagePart } from '#/features/ai/core'

/** 思考结束后隔多久自动收起（给用户一点时间看清最后一行） */
const AUTO_CLOSE_DELAY_MS = 600

/**
 * 思考链（Reasoning / Chain of thought）卡片。
 *
 * 遵循 AI SDK / AI Elements 的折叠与自动收起规范：
 * - 默认状态与历史会话：默认保持折叠（Collapsed），不侵占会话主视觉；
 * - 流式思考中：自动临时展开，实时呈现思考动态与脉冲；
 * - 思考结束：自动平滑折叠收起（Auto-close），把空间留给正式回答；
 * - 用户随时可点击 Trigger 自由展开或重新收起查看完整思考链路；
 * - 纯色语义令牌适配深浅色模式，禁用 dark: 变体。
 *
 * 「自动收起**只做一次**」（`hasAutoClosedRef`）：之后用户自己展开的就归用户，
 * 不能被下一次渲染又收回去。
 */
export function ReasoningPartView({ part }: { part: Extract<AiMessagePart, { type: 'reasoning' }> }) {
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
    if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosedRef.current) {
      const timer = setTimeout(() => {
        setIsOpen(false)
        hasAutoClosedRef.current = true
      }, AUTO_CLOSE_DELAY_MS)
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
        <span className="min-w-0 truncate font-medium text-kumo-subtle">{title}</span>
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
