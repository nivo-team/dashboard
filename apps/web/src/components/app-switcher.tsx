import { DropdownMenu } from '@cloudflare/kumo'
import { CaretUpDownIcon, CheckIcon, SquaresFourIcon } from '@phosphor-icons/react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { isMultiAppEnabled, useAuth } from '#/lib/auth'
import type { AppItem } from '#/lib/auth'
export type { AppItem }

interface AppSwitcherProps {
  apps?: AppItem[]
  currentAppId?: string
  onAppChange?: (app: AppItem) => void
}

/**
 * 侧边栏顶部的应用/系统切换器。
 *
 * 特性：
 * - 优先从全局认证状态同步当前账号实际可用的应用列表；
 * - 侧边栏顶部不显示多余描述，仅显示应用名称，保持克制整洁；
 * - 下拉菜单仅供切换可用应用，仅展示应用名称，完整描述信息在应用选择页（/select-app）展示；
 * - 侧边栏折叠为图标模式时自动隐藏文字与箭头，只保留应用图标；
 * - 悬停时提供柔和反馈（hover:bg-kumo-tint）。
 */
export function AppSwitcher({
  apps: propsApps,
  currentAppId: propsCurrentAppId,
  onAppChange,
}: AppSwitcherProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const auth = useAuth()

  // 可用应用来自认证状态（登录后由 GET /apps 写入），props 可用于覆盖
  const activeApps = propsApps ?? auth.availableApps

  const currentApp =
    (propsCurrentAppId ? activeApps.find((a) => a.id === propsCurrentAppId) : null) ??
    auth.currentApp ??
    activeApps[0]

  // 应用列表尚未就绪（未登录 / 接口未返回）时不渲染切换器
  if (!currentApp) return null

  const CurrentIcon = currentApp.icon

  const handleSelect = (app: AppItem) => {
    auth.setCurrentApp(app.id)
    onAppChange?.(app)
    router.navigate({ to: `/${app.id}/home` as any })
  }

  const currentAppName = t(`apps.${currentApp.id}.name`, currentApp.name)

  // 单应用模式：静态展示当前应用，无需下拉切换器与「查看所有应用」
  if (!isMultiAppEnabled()) {
    return (
      <div className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1.5 text-start">
        <span className="flex size-7 shrink-0 items-center justify-center text-kumo-default">
          <CurrentIcon size={16} weight={currentApp.iconWeight ?? 'regular'} />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-sm text-kumo-default group-data-[state=collapsed]/sidebar:hidden">
          {currentAppName}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            aria-label={t('auth:switchApp', '切换应用')}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1.5 text-start transition-colors hover:bg-kumo-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line"
          >
            {/* 应用图标：不套深色底块，直接显示图标本身 */}
            <span className="flex size-7 shrink-0 items-center justify-center text-kumo-default">
              <CurrentIcon size={16} weight={currentApp.iconWeight ?? 'regular'} />
            </span>

            {/*
              应用名称（侧边栏顶部不显示 desc，只显示 app 名称；折叠时隐藏）。
              不要再加 `leading-none`：`truncate` 自带 overflow:hidden，行高被压到 1 时
              font-semibold 的字形上下会被裁掉，保留 text-sm 自带的 1.25rem 行高即可。
            */}
            <span className="min-w-0 flex-1 truncate font-semibold text-sm text-kumo-default group-data-[state=collapsed]/sidebar:hidden">
              {currentAppName}
            </span>

            {/* 下拉箭头（侧边栏折叠时隐藏） */}
            <CaretUpDownIcon
              size={14}
              className="shrink-0 text-kumo-subtle group-data-[state=collapsed]/sidebar:hidden"
            />
          </button>
        }
      />

      <DropdownMenu.Content className="w-56" align="start">
        {activeApps.map((app) => {
          const ItemIcon = app.icon
          const isSelected = app.id === currentApp.id
          const appName = t(`apps.${app.id}.name`, app.name)

          return (
            <DropdownMenu.Item
              key={app.id}
              onClick={() => handleSelect(app)}
              className="flex items-center gap-2.5"
            >
              <span className="flex size-6 shrink-0 items-center justify-center text-kumo-default">
                <ItemIcon size={14} weight={app.iconWeight ?? 'regular'} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
                {appName}
              </span>
              {isSelected ? (
                <CheckIcon size={14} className="ms-auto shrink-0 text-kumo-brand" />
              ) : null}
            </DropdownMenu.Item>
          )
        })}

        {/* 查看所有应用：回到根路径的应用选择页（_main/index.tsx -> "/"） */}
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onClick={() => router.navigate({ to: '/' })}
          className="flex items-center gap-2.5"
        >
          <span className="flex size-6 shrink-0 items-center justify-center text-kumo-default">
            <SquaresFourIcon size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
            {t('selectApp.viewAll', '查看所有应用')}
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}

/** 官方规范命名别名，兼容 <AccountSwitcher /> */
export const AccountSwitcher = AppSwitcher
