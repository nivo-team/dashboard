import { useRouterState } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID } from '#/lib/auth'
import {
  getBreadcrumbTrailVersion,
  resolveBreadcrumbTrail,
  subscribeBreadcrumbTrail,
} from '#/lib/breadcrumb-trail'
import { NAV_GROUPS, SETTINGS_NAV_ITEMS } from '#/lib/navigation'

export interface CrumbItem {
  label: string
  href?: string
}

/**
 * 根据当前路由动态提取面包屑链路。
 *
 * 导航层级与路由目录一一对应：
 * `/$appId/example/table` → 仪表盘 / 示例 / 表格示例
 * `/$appId/example/table/10001` → 仪表盘 / 示例 / 表格示例 / 10001
 * `/settings/profile` → 设置 / 个人资料
 */
export function useBreadcrumbs(): CrumbItem[] {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // 订阅业务模块注册的动态层级名称（如功能模块的 id → 名称与父级路径）：
  // 模块数据到达后会让这里重算，把 `功能 / 483` 变成 `功能 / system / menus`
  useSyncExternalStore(subscribeBreadcrumbTrail, getBreadcrumbTrailVersion)

  // 处理设置模块独立路由（/settings/**）
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    const current = pathname.replace(/\/+$/, '')
    const settingsHome: CrumbItem = {
      label: t('profileNav.settings', '设置'),
      href: '/settings/profile',
    }
    const matchedItem = SETTINGS_NAV_ITEMS.find(
      (item) => item.to === current || current.startsWith(`${item.to}/`),
    )
    if (!matchedItem) {
      return [settingsHome]
    }
    const itemLabel = matchedItem.labelKey
      ? t(matchedItem.labelKey, matchedItem.label)
      : matchedItem.label
    if (matchedItem.to === current) {
      return [settingsHome, { label: itemLabel }]
    }
    return [
      settingsHome,
      { label: itemLabel, href: matchedItem.to },
      { label: current.slice(matchedItem.to.length + 1) },
    ]
  }

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
  const hits = (target: string) => subPath === target || subPath.startsWith(`${target}/`)
  const matched = navTrails
    .filter((nav) => hits(nav.to))
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (matched) {
    const rest = subPath.slice(matched.to.length).split('/').filter(Boolean)

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

    return [{ label: homeLabel, href: homeHref }, ...trail, ...(namedRest ?? restCrumbs)]
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
