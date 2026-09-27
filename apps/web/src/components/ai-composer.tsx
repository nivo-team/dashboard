import { Button, DropdownMenu, Textarea } from '@cloudflare/kumo'
import {
  ArrowUpIcon,
  CaretDoubleRightIcon,
  CheckIcon,
  EyeIcon,
  StopIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { sendAiMessage, stopAiMessage, useAiSessionStore } from '#/lib/ai'
import { cn } from '#/lib/cn'
import {
  isAiComposerMode,
  usePreferencesStore,
  type AiComposerMode,
} from '#/lib/store'

export interface AiComposerProps {
  className?: string
}

/**
 * 输入模式的菜单项：`labelKey` 是 `ai` 命名空间下的文案键，`fallback` 是兜底。
 *
 * **模式名是本地化的**（中文「询问 / 自动」）—— 与 设置 → AI 的两种形态名同一条约定：
 * 代码里叫 ask / auto，但界面上不该把英文术语直接丢给各语言用户。
 *
 * 图标同时用在**触发按钮**（跟着当前模式变）与**菜单项**（每项各一个）上：
 * 询问 = 眼睛（先看、不动手），自动 = 右向双箭头（放行、让它自己往下走）。
 */
const COMPOSER_MODE_OPTIONS: ReadonlyArray<{
  value: AiComposerMode
  labelKey: string
  fallback: string
  icon: Icon
  /** 图标是否随书写方向镜像：右向箭头要（RTL 的「前进」朝左），眼睛不要 */
  flipIcon?: boolean
}> = [
  { value: 'ask', labelKey: 'modeAsk', fallback: '询问', icon: EyeIcon },
  {
    value: 'auto',
    labelKey: 'modeAuto',
    fallback: '自动',
    icon: CaretDoubleRightIcon,
    flipIcon: true,
  },
]

/**
 * AI 面板的输入区：一块圆角输入框 + 左下角的**输入模式切换** + 行尾的圆形提交按钮。
 *
 * 外观对齐 Cloudflare 控制台的输入区（`ring` 画在整块外框上、聚焦时整块换成品牌色细环），
 * 因此内层 `Textarea` 只负责排版与自动增高，Kumo 自带的输入框外观（底色 / 边框 / 圆角 /
 * 内边距 / 自身聚焦环）在这里被逐项清零 —— **改外观只动外框这一层**，不要把 ring 加回 textarea。
 *
 * 两个键盘约定：`Enter` 提交、`Shift + Enter` 换行（不拦截，交给 textarea 默认行为）；
 * 输入法组字中的回车是「选词」，靠 `isComposing` 让开，否则中文 / 日文用户选词就会误提交。
 *
 * 尺寸随容器走：`Textarea` 的 `autoResize` 从 2 行起、最多 8 行（再多就在框内滚动），
 * 面板被拖窄 / 拉宽时 `ResizeObserver` 会重算换行后的高度，不需要外部传宽度。
 */
export function AiComposer({ className }: AiComposerProps) {
  const { t } = useTranslation('ai')
  const [value, setValue] = useState('')

  const isStreaming = useAiSessionStore((state) => state.status === 'streaming')
  const composerMode = usePreferencesStore((state) => state.aiComposerMode)
  const setComposerMode = usePreferencesStore((state) => state.setAiComposerMode)

  /** 存档里的值理论上已被 `merge` 校验过，这里再兜一次：查不到就按第一项显示。 */
  const activeMode =
    COMPOSER_MODE_OPTIONS.find((option) => option.value === composerMode) ??
    COMPOSER_MODE_OPTIONS[0]

  /** 触发按钮上的图标跟着当前模式走（询问 = 眼睛，自动 = 右向双箭头） */
  const ActiveIcon = activeMode.icon

  // 正在跑一轮时禁用提交：既避免并发请求，也避免用户以为「点了没反应」
  const canSubmit = value.trim().length > 0 && !isStreaming

  const submit = () => {
    const next = value.trim()
    if (!next || isStreaming) return
    // 真的发出去了才清空输入框（未接入时清空等于把用户打的字丢掉，现在不会了）
    setValue('')
    void sendAiMessage(next, composerMode)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl bg-kumo-control ring-1 ring-kumo-line transition-all',
        // 焦点态：整块外框换成品牌色细环（`ring-1` 无变体、`has-[…]` 带变体，后者在后、能覆盖）
        'has-[textarea:focus]:ring-[1.5px] has-[textarea:focus]:ring-kumo-brand/50',
        className,
      )}
    >
      <Textarea
        value={value}
        onValueChange={setValue}
        onKeyDown={handleKeyDown}
        autoResize
        minRows={2}
        maxRows={8}
        aria-label={t('inputLabel', 'AI 输入框')}
        placeholder={t('inputPlaceholder', '输入你的问题…')}
        // 清零 Kumo 输入框的默认外观：底色 / 圆角 / padding / 自身 ring 全部让给外层框。
        // 用方向后缀（`px-4 pt-4 pb-0`）而不是 `p-4`，避免与 Kumo 的 `py-2` 拼出多余的上下留白。
        className="min-h-0 rounded-none border-0 bg-transparent px-4 pt-4 pb-0 ring-0 focus:ring-0"
      />

      <div className="flex items-center gap-2 p-3 pt-0">
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              // 截图里那颗 pill：`size="sm"` 的方形底 + `rounded-full`，文字比默认按钮淡一档
              // （Kumo 的 secondary 把 `!text-kumo-default` 写成了 important，覆盖它也得带 `!`）。
              <Button
                type="button"
                variant="secondary"
                size="sm"
                // 可见文字只是当前模式名，读屏听不出这是「切换模式」的入口，所以把两者都报出来
                aria-label={`${t('modeLabel', '输入模式')}: ${t(activeMode.labelKey, activeMode.fallback)}`}
                className="rounded-full !text-kumo-subtle not-disabled:hover:!text-kumo-default"
              />
            }
          >
            <ActiveIcon
              size={14}
              className={cn('shrink-0', activeMode.flipIcon && 'rtl-flip')}
            />
            <span>{t(activeMode.labelKey, activeMode.fallback)}</span>
          </DropdownMenu.Trigger>

          {/* 触发区在面板最底部：菜单必须**往上**弹，否则会顶出视口（`Content` 默认 sideOffset 8） */}
          <DropdownMenu.Content side="top" align="start" className="w-40">
            <DropdownMenu.RadioGroup
              value={composerMode}
              onValueChange={(value) => {
                if (isAiComposerMode(value)) setComposerMode(value)
              }}
            >
              {COMPOSER_MODE_OPTIONS.map((option) => {
                const OptionIcon = option.icon
                return (
                  // 图标作为 children 的第一个节点 + `gap-2`，**不要**用 `icon` prop：
                  // Kumo 那里写死了 `mr-2`（物理方向），RTL 下间距不会镜像。
                  <DropdownMenu.RadioItem
                    key={option.value}
                    value={option.value}
                    className="gap-2"
                  >
                    <OptionIcon
                      size={14}
                      className={cn(
                        'shrink-0 text-kumo-subtle',
                        option.flipIcon && 'rtl-flip',
                      )}
                    />
                    <span className="min-w-0 truncate">
                      {t(option.labelKey, option.fallback)}
                    </span>
                    {/*
                      选中标记自己画：Kumo 的 `RadioItemIndicator` 写死了 `ml-auto`（物理方向），
                      RTL 下会和 `ms-auto` 打架、把勾推到中间。这里只留 `ms-auto`。
                    */}
                    {option.value === composerMode ? (
                      <CheckIcon
                        size={14}
                        className="ms-auto shrink-0 text-kumo-brand"
                      />
                    ) : null}
                  </DropdownMenu.RadioItem>
                )
              })}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu>

        {isStreaming ? (
          /*
            跑一轮时把提交位换成「停止」：模型答到一半发现跑偏了，用户必须能打断。
            `abortSignal` 一路传到 `streamText`，中止后 `chat.ts` 会把 status 复位。
          */
          <Button
            type="button"
            variant="secondary"
            shape="circle"
            size="sm"
            className="ms-auto"
            onClick={stopAiMessage}
            aria-label={t('stop', '停止')}
          >
            <StopIcon size={12} weight="fill" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            shape="circle"
            size="sm"
            className="ms-auto"
            disabled={!canSubmit}
            onClick={submit}
            aria-label={t('send', '发送')}
          >
            {/* 上下向图标：跟随的是「提交」语义，不随书写方向翻转，不加 rtl-flip */}
            <ArrowUpIcon size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
