import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AuthLayout } from '#/features/auth'

/**
 * 认证页面通用布局路由（`/_auth/route.tsx`）
 *
 * 组织顶栏独立的品牌 Logo 与切换控制器，子路由纯净承载具体认证内容。
 */
export const Route = createFileRoute('/_auth')({
  component: AuthLayoutRoute,
})

function AuthLayoutRoute() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  )
}
