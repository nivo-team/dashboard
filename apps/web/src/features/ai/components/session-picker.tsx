import { Button, Popover } from '@cloudflare/kumo'
import { CaretDownIcon, PlusIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiSessionList } from '#/features/ai/components/session-list'
import { useAiSessionStore } from '#/features/ai/core'

/**
 * 当前会话的标题（没有标题的空白会话回落成「新对话」）。
 *
 * 两个使用点共用这一份：会话选择器的按钮文案，以及**折叠态浮窗**头行那句标题 ——
 * 折叠态只是把选择器换成「头像 + 标题」，标题必须与展开时所见完全一致。
 *
 * 放在这里而不是 `#/features/ai/core`：兜底文案要过 i18n（`ai` 命名空间），lib 层不依赖
 * react-i18next；而「会话标题怎么取、怎么兜底」正是本模块的知识。
 */
export function useActiveSessionTitle(): string {
  const { t } = useTranslation('ai')
  const sessions = useAiSessionStore((state) => state.sessions)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)

  return useMemo(() => {
    const active = sessions.find((item) => item.id === activeSessionId)
    return active?.title || t('sessionNew', '新对话')
  }, [activeSessionId, sessions, t])
}

/**
 * 会话选择器：AI 面板头行左侧那颗按钮，点开是「搜索 + 按时间分组的历史 + 新对话」。
 *
 * 列表本体（搜索 / 分组 / 删除确认）在 `AiSessionList` —— 全屏对话页的侧边栏
 * 用的是同一份，避免两处各写一套而漂移。这里只负责 Popover 外壳与底部的新对话按钮。
 */
export function AiSessionPicker() {
  const { t } = useTranslation('ai')
  const startNewSession = useAiSessionStore((state) => state.startNewSession)
  const activeTitle = useActiveSessionTitle()

  const [open, setOpen] = useState(false)

  const handleNew = () => {
    startNewSession()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          // ghost 按钮形态：当前会话标题 + caret。`shrink`（而非 Button 默认的
          // `shrink-0`）是必须的，否则长标题会把头行的关闭按钮挤出去
          <Button
            variant="ghost"
            className="min-w-0 shrink justify-start gap-2 px-2 font-medium"
            aria-label={t('sessionPicker', '选择对话')}
          />
        }
      >
        {/* 只显示当前会话标题 + 下箭头（不再带 AI 标识图标） */}
        <span className="truncate">{activeTitle}</span>
        {/*
          `CaretDownIcon` 是**上下向**图标：它表示「点开一个浮层」，
          不随书写方向翻转，所以**不加 `rtl-flip`**（RTL 下翻的只有左右向箭头）。
        */}
        <CaretDownIcon size={12} className="shrink-0 text-kumo-subtle" />
      </Popover.Trigger>

      {/* 面板：`p-0` 顶掉 Kumo 默认的 px-4 py-3，三段（搜索 / 列表 / 底部）各自带内边距 */}
      <Popover.Content side="bottom" align="start" className="w-80 p-0">
        <AiSessionList className="max-h-80" onSelect={() => setOpen(false)} />

        {/* 底部同样只留白、不画上边线；按钮回到默认尺寸，与输入框等高 */}
        <div className="p-2">
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={handleNew}
          >
            <PlusIcon size={16} />
            {t('sessionNew', '新对话')}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  )
}
