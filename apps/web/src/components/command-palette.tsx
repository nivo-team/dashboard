import { CommandPalette } from '@cloudflare/kumo'
import type { Icon } from '@phosphor-icons/react'
import { ArrowRightIcon, DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import {
  ALL_NAV_TARGETS,
  ALL_SHELL_NAV_TARGETS,
  filterNavTargets,
  filterShellNavItems,
} from '#/lib/navigation'
import { usePermissionContext } from '#/lib/permissions'
import { useColorMode } from '#/lib/use-color-mode'
import type { ColorMode } from '#/lib/use-color-mode'

interface PaletteItem {
  id: string
  label: string
  icon: Icon
  /** 搜索用关键词（含中英双语，两种输入都能命中）。 */
  keywords: string
  run: () => void
}

interface PaletteGroup {
  id: string
  label: string
  items: PaletteItem[]
}

interface CommandPaletteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 主题命令：文案与 `UserMenu` 的「外观」子菜单**共用 `theme.*`**，不另起一套，
 * 因此这里只声明 mode / 图标，label 交给 i18n。
 */
const THEME_OPTIONS: Array<{
  mode: ColorMode
  labelKey: string
  defaultLabel: string
  icon: Icon
}> = [
  { mode: 'light', labelKey: 'theme.light', defaultLabel: '浅色模式', icon: SunIcon },
  { mode: 'dark', labelKey: 'theme.dark', defaultLabel: '深色模式', icon: MoonIcon },
  { mode: 'system', labelKey: 'theme.system', defaultLabel: '跟随系统', icon: DesktopIcon },
]

/**
 * ⌘K 命令面板：页面跳转 + 主题切换。
 *
 * 页面项直接读 `#/lib/navigation` 的两份导航配置 —— 业务导航（`NAV_GROUPS`，`to` 相对 appId）
 * 与外壳导航（`MAIN_NAV_ITEMS` / `SETTINGS_NAV_ITEMS`，`to` 是绝对路径）。
 * 侧边栏也用同一份数据，**加导航项只改那个文件**，两个入口自动同步。
 *
 * 列表项只显示标题（不再有描述行）；新增自定义命令时，往 `themeItems` 那样的数组里加一项即可。
 */
export function CommandPaletteDialog({ open, onOpenChange }: CommandPaletteDialogProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const { mode, setMode } = useColorMode()
  const [query, setQuery] = useState('')

  // 权限上下文与过滤都走 `#/lib/navigation` 的统一管道（与侧边栏同一份判定）
  const permissionContext = usePermissionContext()

  const groups = useMemo<PaletteGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const matches = (item: PaletteItem) =>
      q.length === 0 || `${item.label} ${item.keywords}`.toLowerCase().includes(q)

    // 业务页面：`to` 相对 appId，需要拼前缀；二级项展示为「父级 · 子级」；过滤无权限的目标项
    const pageItems: PaletteItem[] = filterNavTargets(ALL_NAV_TARGETS, {
      context: permissionContext,
    }).map((item) => {
      const selfLabel = item.labelKey ? t(item.labelKey, item.label) : item.label
      const parentLabel = item.parentLabelKey
        ? t(item.parentLabelKey, {
            defaultValue: item.parentLabel ?? item.parentLabelKey,
          })
        : item.parentLabel
      const label = parentLabel ? `${parentLabel} · ${selfLabel}` : selfLabel

      return {
        id: `nav:${item.to}#${label}`,
        label,
        icon: item.icon,
        keywords: item.keywords.join(' '),
        run: () => navigate({ to: `/${appId}${item.to}` as never }),
      }
    })

    // 外壳页面（应用选择 / 个人资料 / 设置）：`to` 已是绝对路径，不能再拼 appId
    const shellItems: PaletteItem[] = filterShellNavItems(ALL_SHELL_NAV_TARGETS, {
      context: permissionContext,
    }).map((item) => {
      const label = item.labelKey ? t(item.labelKey, item.label) : item.label
      return {
        id: `shell:${item.to}`,
        label,
        icon: item.icon,
        keywords: (item.keywords ?? []).join(' '),
        run: () => navigate({ to: item.to as never }),
      }
    })

    const themeItems: PaletteItem[] = THEME_OPTIONS.map((option) => ({
      id: `action:theme-${option.mode}`,
      label: t(option.labelKey, option.defaultLabel),
      icon: option.icon,
      keywords: `theme ${option.mode} 主题`,
      run: () => setMode(option.mode),
    }))

    return [
      {
        id: 'pages',
        label: t('commandPalette.groups.pages', '页面'),
        items: [...pageItems, ...shellItems].filter(matches),
      },
      {
        id: 'actions',
        label: t('commandPalette.groups.actions', '操作'),
        items: themeItems.filter(matches),
      },
    ].filter((group) => group.items.length > 0)
  }, [query, navigate, setMode, t, appId, permissionContext])

  const complete = () => {
    onOpenChange(false)
    setQuery('')
  }

  const currentTheme = THEME_OPTIONS.find((option) => option.mode === mode) ?? THEME_OPTIONS[2]

  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      items={groups}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(group) => group.label}
      getSelectableItems={(items) => items.flatMap((group) => group.items)}
      onSelect={(item) => {
        item.run()
        complete()
      }}
    >
      <CommandPalette.Input placeholder={t('commandPalette.placeholder', '搜索页面或输入命令…')} />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(group: PaletteGroup) => (
            <CommandPalette.Group key={group.id} items={group.items}>
              <CommandPalette.GroupLabel>{group.label}</CommandPalette.GroupLabel>
              <CommandPalette.Items>
                {(item: PaletteItem) => (
                  <CommandPalette.Item
                    key={item.id}
                    value={item}
                    /*
                      Kumo 的 Item 内置物理方向 `text-left`，RTL（阿拉伯语）下会把项内文字
                      顶到左侧；用逻辑属性 `text-start` 覆盖 —— `cn` 走 tailwind-merge，
                      `text-left` 与 `text-start` 属同一冲突组，后者会顶掉前者。
                      与 DataTable 覆盖 TableRoot 的做法一致（见 data-table.tsx）。
                    */
                    className="text-start"
                    onClick={() => {
                      item.run()
                      complete()
                    }}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <item.icon size={16} className="shrink-0 text-kumo-subtle" />
                      <span className="min-w-0 flex-1 truncate text-sm text-kumo-default">
                        {item.label}
                      </span>
                      <ArrowRightIcon
                        size={14}
                        // 这是「执行 / 进入」提示箭头：RTL 下要指向左侧（见 styles.css 的 .rtl-flip）
                        className="rtl-flip shrink-0 text-kumo-subtle opacity-0 group-data-[highlighted]:opacity-100"
                      />
                    </span>
                  </CommandPalette.Item>
                )}
              </CommandPalette.Items>
            </CommandPalette.Group>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>{t('commandPalette.empty', '没有匹配的结果')}</CommandPalette.Empty>
      </CommandPalette.List>
      <CommandPalette.Footer>
        <span className="text-xs text-kumo-subtle">
          {t('theme.label', '主题')}：{t(currentTheme.labelKey, currentTheme.defaultLabel)}
        </span>
      </CommandPalette.Footer>
    </CommandPalette.Root>
  )
}
