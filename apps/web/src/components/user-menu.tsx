import { Button, DropdownMenu } from '@cloudflare/kumo'
import {
  CheckIcon,
  ClockIcon,
  DesktopIcon,
  GlobeIcon,
  MoonIcon,
  PaintBrushIcon,
  SignOutIcon,
  SunIcon,
  UserIcon,
} from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '#/lib/auth'
import { useColorMode } from '#/lib/use-color-mode'
import type { ColorMode } from '#/lib/use-color-mode'
import { useLocale } from '#/lib/use-locale'
import type { LocaleKey } from '#/lib/use-locale'
import { useTimezone } from '#/lib/timezone'
import type { TimezoneKey } from '#/lib/timezone'

export interface UserMenuProps {
  align?: 'start' | 'center' | 'end'
  onOpenCommandPalette?: () => void
}

interface ThemeOptionItem {
  key: ColorMode
  labelKey: string
  defaultLabel: string
  icon: typeof SunIcon
}

const THEME_OPTIONS: ThemeOptionItem[] = [
  { key: 'light', labelKey: 'theme.light', defaultLabel: '浅色模式', icon: SunIcon },
  { key: 'dark', labelKey: 'theme.dark', defaultLabel: '深色模式', icon: MoonIcon },
  { key: 'system', labelKey: 'theme.system', defaultLabel: '跟随系统', icon: DesktopIcon },
]

/**
 * 规范用户菜单组件：
 * 顶部显示当前账号邮箱，包含「外观」、「语言」、「时区」的二级子菜单及「退出登录」。
 */
export function UserMenu({ align = 'end' }: UserMenuProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { mode, setMode } = useColorMode()
  const { locale, setLocale, supportedLocales } = useLocale()
  const { timezone, setTimezone, supportedTimezones, getTimezoneOffsetLabel } = useTimezone()
  const navigate = useNavigate()

  /**
   * 登出：跳转由 `logout()` 在状态清理完成后统一收口（见 `#/lib/auth` 的 `redirectToLogin`）。
   * 这里刻意**不**自行 `navigate('/login')`：在 `isAuthenticated` 尚未清理时跳过去，
   * 会被登录页的 `beforeLoad` 判定为「已登录」并弹回原页面。
   */
  const handleLogout = () => {
    void logout()
  }

  return (
    <div data-tsd-source="/src/components/user-menu.tsx">
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              shape="square"
              variant="ghost"
              aria-label={t('userMenu.ariaLabel', '账号菜单')}
              icon={<UserIcon size={18} weight="fill" />}
            />
          }
        />
        <DropdownMenu.Content className="w-52" align={align}>
          {/* 顶部账号名称 */}
          <div className="px-3 py-2">
            <p className="truncate text-xs font-medium text-kumo-default">
              {user?.username || 'Admin'}
            </p>
          </div>

          {/* 个人资料入口：顶层页面 /settings/profile，与根路径共用 _main 外壳（侧边栏 + 顶栏） */}
          <DropdownMenu.Item
            onClick={() => navigate({ to: '/settings/profile' as any })}
            className="gap-2"
          >
            <UserIcon size={16} className="text-kumo-subtle" />
            <span className="text-xs text-kumo-default">
              {t('profileNav.myProfile', '个人资料')}
            </span>
          </DropdownMenu.Item>

          {/* 外观设置（二级子菜单） */}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex items-center gap-2">
              <PaintBrushIcon size={16} className="text-kumo-subtle" />
              <span>{t('theme.label', '主题')}</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent className="w-36">
              {THEME_OPTIONS.map((item) => {
                const isSelected = item.key === mode
                const ItemIcon = item.icon
                return (
                  <DropdownMenu.Item
                    key={item.key}
                    onClick={() => setMode(item.key)}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-xs text-kumo-default">
                      <ItemIcon size={14} className="text-kumo-subtle" />
                      <span>{t(item.labelKey, item.defaultLabel)}</span>
                    </span>
                    {isSelected ? <CheckIcon size={14} className="text-kumo-brand" /> : null}
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>

          {/* 语言设置（二级子菜单） */}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex items-center gap-2">
              <GlobeIcon size={16} className="text-kumo-subtle" />
              <span>{t('language', '语言')}</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent className="w-40">
              {supportedLocales.map((item) => {
                const isSelected = item.key === locale
                return (
                  <DropdownMenu.Item
                    key={item.key}
                    onClick={() => setLocale(item.key as LocaleKey)}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-kumo-default">{item.nativeName}</span>
                    {isSelected ? <CheckIcon size={14} className="text-kumo-brand" /> : null}
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>

          {/* 时区设置（二级子菜单） */}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex items-center gap-2">
              <ClockIcon size={16} className="text-kumo-subtle" />
              <span>{t('timezone.label', '时区')}</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent className="w-48">
              {supportedTimezones.map((item) => {
                const isSelected = item.key === timezone
                return (
                  <DropdownMenu.Item
                    key={item.key}
                    onClick={() => setTimezone(item.key as TimezoneKey)}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-kumo-default">
                      {`${t(item.labelKey, item.defaultName)} (${getTimezoneOffsetLabel(item.key)})`}
                    </span>
                    {isSelected ? <CheckIcon size={14} className="text-kumo-brand" /> : null}
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>

          {/* 退出登录 */}
          <DropdownMenu.Item variant="danger" onClick={handleLogout}>
            <span className="flex items-center gap-2 text-sm">
              <SignOutIcon size={16} className="rtl-flip" />
              <span>{t('userMenu.logout', '退出登录')}</span>
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  )
}
