import { Tooltip } from '@cloudflare/kumo'
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useAiSessionStore, type AiMessage } from '#/features/ai/core'
import { cn } from '#/lib/cn'
import { collectText, splitUserParts } from './message-parts'
import { RelativeTimeTooltip } from './relative-time'
import { useCopy } from './use-copy'

/**
 * 用户消息：右对齐的气泡 + 附件预览 + 一条操作栏。
 *
 * 附件分两类渲染（见 `splitUserParts`）：
 * - **图片**：按原图比例预览、限制最大高度；
 * - **文本文件**（md / txt）：一张只读卡片（图标 + 文件名）—— 内容已经作为文本发给模型，
 *   不在气泡里铺开。
 *
 * 只发附件不打字时也只渲染附件那一块（`gap-2` 在没有文字时不会留下空档）。
 */
export function UserMessage({ message, streaming }: { message: AiMessage; streaming: boolean }) {
  const { t } = useTranslation('ai')
  const rollbackToMessage = useAiSessionStore((state) => state.rollbackToMessage)
  const text = collectText(message.parts)
  const { images, textFiles } = splitUserParts(message.parts)
  const { copied, copy } = useCopy(text)

  return (
    <div className="flex flex-col items-end gap-1.5">
      {images.length > 0 || textFiles.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {images.map((image, index) => (
            <img
              key={`${message.id}-image-${index}`}
              src={image.url}
              alt={image.name ?? t('attachmentPreview', '待发送的附件')}
              className="max-h-40 rounded-xl ring-1 ring-kumo-line"
            />
          ))}
          {textFiles.map((file, index) => (
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

      {/* 用户消息操作栏：发送时间(相对时间+Tooltip纯时间), 复制(纯图标+Tooltip), 回退(纯图标+Tooltip) */}
      <div className="flex items-center gap-2 px-1 text-xs text-kumo-subtle justify-end">
        {message.createdAt ? <RelativeTimeTooltip value={message.createdAt} /> : null}

        {text ? (
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

        <Tooltip content={t('rollback', '回退')}>
          <button
            type="button"
            disabled={streaming}
            onClick={() => rollbackToMessage(message.id)}
            aria-label={t('rollback', '回退')}
            className={cn(
              'inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-none',
              streaming && 'cursor-not-allowed opacity-50',
            )}
          >
            <ArrowCounterClockwiseIcon size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
