import { Button, DropdownMenu } from '@cloudflare/kumo'
import {
  CaretDownIcon,
  CheckIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useColorMode } from '#/lib/use-color-mode'
import type { ColorMode } from '#/lib/use-color-mode'

interface ThemeSwitcherProps {
  className?: string
  align?: 'start' | 'center' | 'end'
}

interface ModeItem {
  key: ColorMode
  labelKey: string
  defaultLabel: string
  icon: typeof SunIcon
}

const THEME_OPTIONS: ModeItem[] = [
  { key: 'light', labelKey: 'theme.light', defaultLabel: '浅色模式', icon: SunIcon },
  { key: 'dark', labelKey: 'theme.dark', defaultLabel: '深色模式', icon: MoonIcon },
  { key: 'system', labelKey: 'theme.system', defaultLabel: '跟随系统', icon: DesktopIcon },
]

/**
 * 通用系统颜色/主题模式切换组件
 * 纯粹克制，去除多余 label，适配当前多语言
 */
export function ThemeSwitcher({
  className = '',
  align = 'end',
}: ThemeSwitcherProps) {
  const { t } = useTranslation()
  const { mode, setMode } = useColorMode()
  const currentOption =
    THEME_OPTIONS.find((item) => item.key === mode) ?? THEME_OPTIONS[2]
  const CurrentIcon = currentOption.icon
  const currentLabel = t(currentOption.labelKey, currentOption.defaultLabel)

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            icon={<CurrentIcon size={16} />}
            className={className}
            title={currentLabel}
            aria-label={t('theme.label', '主题')}
          >
            <span>{currentLabel}</span>
            <CaretDownIcon size={12} className="ml-0.5 opacity-70" />
          </Button>
        }
      />
      <DropdownMenu.Content align={align} className="w-36">
        {THEME_OPTIONS.map((item) => {
          const isSelected = item.key === mode
          const ItemIcon = item.icon
          const itemLabel = t(item.labelKey, item.defaultLabel)

          return (
            <DropdownMenu.Item
              key={item.key}
              onClick={() => setMode(item.key)}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-kumo-default">
                <ItemIcon size={14} className="text-kumo-subtle" />
                <span>{itemLabel}</span>
              </span>
              {isSelected ? (
                <CheckIcon size={14} className="text-kumo-brand" />
              ) : null}
            </DropdownMenu.Item>
          )
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
