import { Button, DropdownMenu, Tooltip } from '@cloudflare/kumo'
import { CaretDoubleRightIcon, CheckIcon, PencilLineIcon, type Icon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/cn'
import { isAiComposerMode, type AiComposerMode } from '#/lib/store'

/**
 * 输入区左下角的**输入模式**切换（询问 / 自动）。
 *
 * 两项的差别落在「填写表单」这件事上（工具层也是这么实现的）：
 * - `ask`：`fill_form` / `submit_form` 每次都要用户点确认；
 * - `auto`：`fill_form` 直接写、`submit_form` 在 `canSubmit()` 通过时直接提交
 *   （`call_write_api` 是例外，两种模式下都要确认）。
 * 菜单里那句说明就是把这条差别讲清楚 —— 只说「询问 / 自动」，用户猜不到它管什么。
 *
 * **模式名与说明都是本地化的**（中文「询问 / 自动」）—— 与 设置 → AI 的两种形态名同一条
 * 约定：代码里叫 ask / auto，但界面上不该把英文术语直接丢给各语言用户。
 *
 * 图标同时用在**触发按钮**（跟着当前模式变）与**菜单项**（每项各一个）上：
 * 询问 = 铅笔（要动笔、但先给你看），自动 = 右向双箭头（放行、让它自己往下走）。
 */
const COMPOSER_MODE_OPTIONS: ReadonlyArray<{
  value: AiComposerMode
  labelKey: string
  fallback: string
  /** 菜单项第二行的说明（见上：说明它到底管哪一步） */
  hintKey: string
  hintFallback: string
  icon: Icon
  /** 图标是否随书写方向镜像：右向箭头要（RTL 的「前进」朝左），铅笔不要 */
  flipIcon?: boolean
}> = [
  {
    value: 'ask',
    labelKey: 'modeAsk',
    fallback: '询问',
    hintKey: 'modeAskHint',
    hintFallback: '每次填写表单都会请你确认',
    icon: PencilLineIcon,
  },
  {
    value: 'auto',
    labelKey: 'modeAuto',
    fallback: '自动',
    hintKey: 'modeAutoHint',
    hintFallback: '自动填写并提交表单',
    icon: CaretDoubleRightIcon,
    flipIcon: true,
  },
]

export function ComposerModeMenu({
  value,
  onChange,
}: {
  value: AiComposerMode
  onChange: (mode: AiComposerMode) => void
}) {
  const { t } = useTranslation('ai')

  /** 存档里的值理论上已被 `merge` 校验过，这里再兜一次：查不到就按第一项显示。 */
  const activeMode =
    COMPOSER_MODE_OPTIONS.find((option) => option.value === value) ?? COMPOSER_MODE_OPTIONS[0]
  /** 触发按钮上的图标跟着当前模式走（询问 = 铅笔，自动 = 右向双箭头） */
  const ActiveIcon = activeMode.icon

  return (
    <DropdownMenu>
      {/*
        Tooltip 一律走 `render={<Button/>}`（Kumo 的 Tooltip 自己就是 trigger，
        把按钮塞进 children 会得到嵌套 button）。`className="cursor-pointer"` 是必需的：
        Kumo 会给 trigger 补一个 `cursor-default`，按钮该是手型。
      */}
      <Tooltip
        content={t('modeTooltip', '切换输入模式')}
        className="cursor-pointer"
        render={
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
          />
        }
      >
        <ActiveIcon size={14} className={cn('shrink-0', activeMode.flipIcon && 'rtl-flip')} />
        <span>{t(activeMode.labelKey, activeMode.fallback)}</span>
      </Tooltip>

      {/*
        触发区在面板最底部：菜单必须**往上**弹，否则会顶出视口（`Content` 默认 sideOffset 8）。
        宽度要放得下第二行的说明，所以比普通菜单宽（`w-64`），说明允许折行、不做截断。
      */}
      <DropdownMenu.Content side="top" align="start" className="w-64">
        <DropdownMenu.RadioGroup
          value={value}
          onValueChange={(next) => {
            if (isAiComposerMode(next)) onChange(next)
          }}
        >
          {COMPOSER_MODE_OPTIONS.map((option) => {
            const OptionIcon = option.icon
            const selected = option.value === value
            return (
              /*
                每一项是**两行**（标题 + 一句说明），与截图里那种「选项即解释」的写法
                一致：只说「询问 / 自动」，没人知道它管的是表单要不要确认。

                图标作为 children 的第一个节点 + `gap-2`，**不要**用 `icon` prop：
                Kumo 那里写死了 `mr-2`（物理方向），RTL 下间距不会镜像。
                基类是 `items-center`（单行菜单的居中）；这里两行文字，改成 `items-start`
                让图标与勾跟**第一行**对齐（Kumo 的 `cn` 走 tailwind-merge，同类名会被顶掉）。
              */
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="items-start gap-2 py-2"
              >
                <OptionIcon
                  size={15}
                  className={cn(
                    'mt-0.5 shrink-0',
                    // 当前模式那颗用品牌色，一眼能看出选中的是哪个（勾在行尾，颜色在这里）
                    selected ? 'text-kumo-brand' : 'text-kumo-subtle',
                    option.flipIcon && 'rtl-flip',
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">{t(option.labelKey, option.fallback)}</span>
                  <span className="text-xs leading-snug text-kumo-subtle">
                    {t(option.hintKey, option.hintFallback)}
                  </span>
                </span>
                {/*
                  选中标记自己画：Kumo 的 `RadioItemIndicator` 写死了 `ml-auto`（物理方向），
                  RTL 下会和 `ms-auto` 打架、把勾推到中间。这里只留 `ms-auto`。
                */}
                {selected ? (
                  <CheckIcon size={14} className="ms-auto mt-0.5 shrink-0 text-kumo-brand" />
                ) : null}
              </DropdownMenu.RadioItem>
            )
          })}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
