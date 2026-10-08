import { Link as KumoLink, type KumoLinkVariant } from '@cloudflare/kumo'
import type { ComponentProps, ReactNode } from 'react'

export interface RouterLinkProps extends Omit<ComponentProps<typeof KumoLink>, 'href'> {
  /** 目标路由路径（兼容 TanStack Router 的 `to` 与标准 `href`） */
  to?: string
  href?: string
  /**
   * Kumo 官方链接视觉变体：
   * - `plain`：纯色无下划线链接，使用 Kumo 链接主色（text-kumo-link），hover 时平滑过渡
   * - `inline`：带正规下划线偏移的内联文本链接
   * - `current`：继承父级文字颜色（text-current）并附带正规下划线
   */
  variant?: KumoLinkVariant
  children: ReactNode
}

/**
 * 业务专用超薄路由链接组件（RouterLink）
 *
 * 融合两端能力：
 * 1. 【设计系统样式】：使用 Kumo UI 官方 Link 语义颜色（`text-kumo-link` 链接主色）与变体规范；
 * 2. 【客户端路由跳转】：借助根级 LinkProvider 自动无缝桥接 TanStack Router SPA 跳转；
 * 3. 【开发体验】：同时支持 TanStack Router 习惯的 `to` 属性与标准 `href` 属性。
 */
function RouterLinkBase({
  to,
  href,
  variant = 'plain',
  className = '',
  children,
  ...rest
}: RouterLinkProps) {
  const target = to ?? href ?? '/'

  return (
    <KumoLink href={target} variant={variant} className={className} {...rest}>
      {children}
    </KumoLink>
  )
}

export const RouterLink = Object.assign(RouterLinkBase, {
  ExternalIcon: KumoLink.ExternalIcon,
})
