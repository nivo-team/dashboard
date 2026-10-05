import { Breadcrumbs, Sidebar } from '@cloudflare/kumo'
import { useRouterState } from '@tanstack/react-router'
import { Fragment, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { HeaderActions } from '#/components/header-actions'
import { DEFAULT_APP_ID } from '#/lib/auth'
import {
  getBreadcrumbTrailVersion,
  resolveBreadcrumbTrail,
  subscribeBreadcrumbTrail,
} from '#/lib/breadcrumb-trail'
import { NAV_GROUPS } from '#/lib/navigation'
import { usePreferencesStore } from '#/lib/store'

interface AppHeaderProps {
  onOpenCommandPalette: () => void
  /** 切换 AI 面板（`AppShell` 持有它的展开状态，见 components/app-shell.tsx） */
  onToggleAskAi: () => void
  /** AI 面板当前是否展开：只用来给按钮画 `aria-expanded`（**不带视觉激活态**，见 `HeaderActions`） */
  isAskAiOpen: boolean
}

interface CrumbItem {
  label: string
  href?: string
}

/**
 * 根据当前路由动态提取面包屑链路。
 *
 * 导航层级与路由目录一一对应：
 * `/$appId/example/table` → 仪表盘 / 示例 / 表格示例
 * `/$appId/example/table/10001` → 仪表盘 / 示例 / 表格示例 / 10001
 */
function useBreadcrumbs(): CrumbItem[] {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // 订阅业务模块注册的动态层级名称（如功能模块的 id → 名称与父级路径）：
  // 模块数据到达后会让这里重算，把 `功能 / 483` 变成 `功能 / system / menus`
  useSyncExternalStore(subscribeBreadcrumbTrail, getBreadcrumbTrailVersion)

  const homeLabel = t('nav.home', '仪表盘')

  // 剥离第一级前缀 appId（用于给后端区分具体 App，不参与面包屑计算）
  // 例如："/console" 或 "/console/home" -> 仪表盘；"/console/example/table" -> 仪表盘 / 示例 / 表格示例
  const segments = pathname.split('/').filter(Boolean)
  const appId = segments[0] || DEFAULT_APP_ID
  const subSegments = segments.slice(1)
  const subPath = `/${subSegments.join('/')}`
  const appPrefix = `/${appId}`
  const homeHref = `/${appId}/home`

  if (segments.length <= 1 || subPath === '/' || subPath === '/home') {
    return [{ label: homeLabel }]
  }

  const resolveLabel = (labelKey: string | undefined, label: string) =>
    labelKey ? t(labelKey, label) : label

  // 把导航配置展开为「路径 → 面包屑链路」，父级分组作为链路中的可点击节点
  const navTrails: { to: string; trail: CrumbItem[] }[] = []
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      navTrails.push({
        to: item.to,
        trail: [{ label: resolveLabel(item.labelKey, item.label) }],
      })
      for (const child of item.children ?? []) {
        navTrails.push({
          to: child.to,
          trail: [
            {
              label: resolveLabel(item.labelKey, item.label),
              href: `${appPrefix}${item.to}`,
            },
            { label: resolveLabel(child.labelKey, child.label) },
          ],
        })
      }
    }
  }

  // 优先精确匹配；否则取最长前缀命中项，剩余分段作为动态参数逐级追加
  const hits = (target: string) =>
    subPath === target || subPath.startsWith(`${target}/`)
  const matched = navTrails
    .filter((nav) => hits(nav.to))
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (matched) {
    const rest = subPath
      .slice(matched.to.length)
      .split('/')
      .filter(Boolean)

    const trail: CrumbItem[] = matched.trail.map((crumb, index) => ({
      ...crumb,
      href:
        crumb.href ??
        (rest.length > 0 && index === matched.trail.length - 1
          ? `${appPrefix}${matched.to}`
          : undefined),
    }))

    const restCrumbs: CrumbItem[] = rest.map((segment, index) => {
      const isLast = index === rest.length - 1
      return {
        label: segment,
        href: isLast
          ? undefined
          : `${appPrefix}${matched.to}/${rest.slice(0, index + 1).join('/')}`,
      }
    })

    // 业务模块注册了层级名称时，优先用「名称 + 可点层级」替换原始动态段
    const namedRest = resolveBreadcrumbTrail(`${appPrefix}${subPath}`)

    return [
      { label: homeLabel, href: homeHref },
      ...trail,
      ...(namedRest ?? restCrumbs),
    ]
  }

  // 兜底分段：仅对业务层级分段，appId 作为首页基准不作为独立面包屑项
  return [
    { label: homeLabel, href: homeHref },
    ...subSegments.map((segment, index) => ({
      label: segment,
      href:
        index < subSegments.length - 1
          ? `/${appId}/${subSegments.slice(0, index + 1).join('/')}`
          : undefined,
    })),
  ]
}

export function AppHeader({
  onOpenCommandPalette,
  onToggleAskAi,
  isAskAiOpen,
}: AppHeaderProps) {
  const crumbs = useBreadcrumbs()
  // AI 功能被关掉时，顶栏的入口整个不出现（面板那边也会被下面收起）
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  return (
    <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-3 md:px-4">
      {/* 移动端打开侧边栏按钮；大屏幕下隐藏 */}
      <Sidebar.Trigger className="md:hidden" />

      {/* 面包屑导航 */}
      <div className="min-w-0 flex-1">
        <Breadcrumbs size="sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <Breadcrumbs.Separator /> : null}
                {crumb.href && !isLast ? (
                  <Breadcrumbs.Link href={crumb.href}>
                    {crumb.label}
                  </Breadcrumbs.Link>
                ) : (
                  <Breadcrumbs.Current>{crumb.label}</Breadcrumbs.Current>
                )}
              </Fragment>
            )
          })}
        </Breadcrumbs>
      </div>

      {/*
        行末工具区：与 MainLayout 顶栏共用同一组件。
        AI 入口与具体应用绑定，只有这里（带 appId 的业务外壳）才开 `showAskAi`。
      */}
      <HeaderActions
        showAskAi={aiEnabled}
        onAskAi={onToggleAskAi}
        askAiExpanded={isAskAiOpen}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    </header>
  )
}
