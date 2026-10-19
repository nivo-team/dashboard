import { Button, DropdownMenu, Tooltip } from '@cloudflare/kumo'
import {
  ChatCircleDotsIcon,
  ImageIcon,
  PlusIcon,
  AtIcon,
} from '@phosphor-icons/react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 输入区行首的**「+」菜单** —— 三件「跟这一轮对话直接有关」的小动作：
 * 添加附件 / 引用位置 / 新对话。
 *
 * 长度刻意压住：真正会长的那份清单是「引用哪个模块 / 哪个页面 / 哪一条记录」，
 * 它走输入框里的 `@`。所以这里从一开始就是 `DropdownMenu` 而不是为单项写一个开关式
 * 上传按钮 —— 加一项就是加一个 `Item`，菜单内容与「怎么弹」都不用再改。
 *
 * 样式用 `secondary`：与旁边的输入模式 pill 同族，一眼看出是「打开一个菜单」，
 * 而不是一颗纯图标的动作按钮（ghost 的那颗是设置按钮）。
 *
 * 菜单**锚在整块输入区上**（`anchor` + 宽 `var(--anchor-width)`）：看起来是贴着输入框
 * 上沿浮出来的一块，而不是挂在颗小圆钮下面。
 */
export function ComposerActionsMenu({
  anchorRef,
  disabled,
  onPickFiles,
  onStartMention,
  onNewSession,
}: {
  anchorRef: RefObject<HTMLDivElement | null>
  /** 跑一轮时禁用「新对话」 */
  disabled: boolean
  onPickFiles: () => void
  onStartMention: () => void
  onNewSession: () => void
}) {
  const { t } = useTranslation('ai')

  return (
    <DropdownMenu modal={false}>
      <Tooltip
        content={t('aiActions', 'AI 动作')}
        className="cursor-pointer"
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                type="button"
                variant="secondary"
                shape="circle"
                size="sm"
                aria-label={t('aiActions', 'AI 动作')}
                className="!text-kumo-subtle not-disabled:hover:!text-kumo-default"
              />
            }
          />
        }
      >
        <PlusIcon size={14} />
      </Tooltip>

      <DropdownMenu.Content
        side="top"
        align="start"
        anchor={anchorRef}
        className="w-[var(--anchor-width)]"
      >
        <DropdownMenu.Item className="items-center gap-2.5 py-2" onClick={onPickFiles}>
          <ImageIcon size={15} className="shrink-0 text-kumo-subtle" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm text-kumo-default">
              {t('addPhotoAndFiles', '添加照片和文件')}
            </span>
            <span className="truncate text-xs text-kumo-subtle">
              {t('promptMentionAttachDesc', '从本机添加图片或 Markdown / 文本文件')}
            </span>
          </span>
        </DropdownMenu.Item>

        <DropdownMenu.Item className="items-center gap-2.5 py-2" onClick={onStartMention}>
          <AtIcon size={15} className="shrink-0 text-kumo-subtle" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm text-kumo-default">
              {t('actionMention', '引用位置')}
            </span>
            <span className="truncate text-xs text-kumo-subtle">
              {t('actionMentionDesc', '打一个 @ 引用模块、页面或某一条记录')}
            </span>
          </span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="items-center gap-2.5 py-2"
          disabled={disabled}
          onClick={onNewSession}
        >
          <ChatCircleDotsIcon size={15} className="shrink-0 text-kumo-subtle" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm text-kumo-default">
              {t('sessionNew', '新对话')}
            </span>
            <span className="truncate text-xs text-kumo-subtle">
              {t('actionNewChatDesc', '从一段空白对话重新开始')}
            </span>
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
