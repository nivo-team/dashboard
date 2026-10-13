import { FileIcon, XIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { AiAttachment } from '#/features/ai/core'
import { formatFileSize } from './attachments'

/**
 * 待发送的附件：夹在输入区与工具行之间。**图片给缩略图，其余给文件卡片**
 * （文件名 + 体积）—— 两者都是 data URL，不回读磁盘。
 * 每个附件右上角都有删除按钮，发出去之前随时能撤掉。
 *
 * 文本文件的内容**不在这里展示** —— 它随消息拼给模型，几百行文档堆在输入框上只会碍事。
 */
export function ComposerAttachmentList({
  attachments,
  onRemove,
}: {
  attachments: readonly AiAttachment[]
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation('ai')
  if (attachments.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2 px-4 py-3">
      {attachments.map((attachment, index) => (
        <li key={`${attachment.name ?? attachment.kind}-${index}`} className="relative">
          {attachment.kind === 'image' ? (
            <img
              src={attachment.url}
              alt={attachment.name ?? t('attachmentPreview', '待发送的附件')}
              className="size-16 rounded-lg object-cover ring-1 ring-kumo-line"
            />
          ) : (
            <span className="flex h-16 w-44 items-center gap-2 rounded-lg bg-kumo-tint px-2.5 ring-1 ring-kumo-line">
              <FileIcon size={18} className="shrink-0 text-kumo-subtle" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs text-kumo-default">{attachment.name}</span>
                <span className="truncate text-xs text-kumo-subtle">
                  {formatFileSize(attachment.size)}
                </span>
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={t('attachmentRemove', '移除这个附件')}
            className="absolute -end-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-kumo-base text-kumo-subtle ring-1 ring-kumo-line transition-colors hover:text-kumo-default"
          >
            <XIcon size={11} />
          </button>
        </li>
      ))}
    </ul>
  )
}
