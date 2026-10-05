import { Link } from '@tanstack/react-router'
import { forwardRef } from 'react'
import type { AnchorHTMLAttributes } from 'react'

/**
 * 把 Kumo 组件内部使用的 `<a href>` 桥接到 TanStack Router。
 *
 * 通过 `<LinkProvider component={AppLink}>` 注册后，
 * `Sidebar.MenuButton href="..."`、`Breadcrumbs.Link href="..."`、`LinkButton`
 * 等所有 Kumo 组件都会自动变成客户端路由跳转。
 */
export const AppLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function AppLink({ href, children, ...rest }, ref) {
  const target = href ?? '/'

  // 外部链接与锚点保持原生行为。
  if (/^(https?:)?\/\//.test(target) || target.startsWith('#')) {
    return (
      <a ref={ref} href={target} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <Link ref={ref} to={target as never} {...rest}>
      {children}
    </Link>
  )
})

export { RouterLink, type RouterLinkProps } from './router-link'

