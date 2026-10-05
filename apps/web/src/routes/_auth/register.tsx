import { createFileRoute, redirect } from '@tanstack/react-router'
import { RegisterPage } from '#/features/auth'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'

/**
 * 注册路由（`/_auth/register.tsx` -> "/register"）—— **薄适配层**。
 *
 * 注册表单与交互逻辑收拢在 `#/features/auth`，路由仅负责导航守卫与页面挂载。
 */
export const Route = createFileRoute('/_auth/register')({
  beforeLoad: () => {
    const auth = getAuthSnapshot()
    // 若已登录，直接引导回工作台/应用主页
    if (auth.isAuthenticated) {
      if (!isMultiAppEnabled()) {
        const appId = auth.currentApp?.id || DEFAULT_APP_ID
        throw redirect({ to: `/${appId}/home` as any })
      }
      if (auth.currentApp) {
        throw redirect({ to: `/${auth.currentApp.id}/home` as any })
      }
      throw redirect({ to: '/' })
    }
  },
  component: RegisterRoute,
})

function RegisterRoute() {
  return <RegisterPage />
}
