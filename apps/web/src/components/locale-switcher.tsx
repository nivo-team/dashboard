import { Button, DropdownMenu } from '@cloudflare/kumo'
import { CaretDownIcon, CheckIcon, GlobeIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '#/lib/use-locale'

interface LocaleSwitcherProps {
  className?: string
  align?: 'start' | 'center' | 'end'
}

/**
 * 通用多语言下拉切换组件（Kumo DropdownMenu 规范）
 * 保持简洁、克制，不显示多余的 label 标题
 */
export function LocaleSwitcher({ className = '', align = 'end' }: LocaleSwitcherProps) {
  const { t } = useTranslation()
  const { locale, currentMeta, supportedLocales, setLocale } = useLocale()

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            icon={<GlobeIcon size={16} />}
            className={className}
            aria-label={t('language', '语言')}
          >
            <span>{currentMeta.label}</span>
            <CaretDownIcon size={12} className="ms-0.5 opacity-70" />
          </Button>
        }
      />
      <DropdownMenu.Content align={align} className="w-40">
        {supportedLocales.map((item) => {
          const isSelected = item.key === locale
          return (
            <DropdownMenu.Item
              key={item.key}
              onClick={() => setLocale(item.key)}
              className="flex items-center justify-between"
            >
              <span className="text-xs font-medium text-kumo-default">{item.nativeName}</span>
              {isSelected ? <CheckIcon size={14} className="text-kumo-brand" /> : null}
            </DropdownMenu.Item>
          )
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
