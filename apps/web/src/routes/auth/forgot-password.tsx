import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ForgotPasswordPage } from '#/features/auth'
import { getAuthSnapshot, resolveAuthenticatedLanding } from '#/lib/auth'
import { isMultiAccountEnabled } from '#/lib/app-config'
import { getBrandConfig } from '#/lib/brand'

/**
 * 重置密码路由（`/auth/forgot-password.tsx` -> "/auth/forgot-password"）
 *
 * 薄路由职责：
 * 1. 守卫已登录用户自动分流；
 * 2. 注入 SEO Meta 与标题信息；
 * 3. 挂载 `ForgotPasswordPage` 业务组件。
 */
export const Route = createFileRoute('/auth/forgot-password')({
  head: () => {
    const brand = getBrandConfig()
    return {
      meta: [
        {
          title: `重置密码 - ${brand.name}`,
        },
        {
          name: 'description',
          content: `通过注册邮箱重置您在 ${brand.name} 的登录密码`,
        },
      ],
    }
  },
  beforeLoad: () => {
    // 单账号部署不提供找回入口：直接回登录页
    if (!isMultiAccountEnabled()) throw redirect({ to: '/auth/login' })

    const auth = getAuthSnapshot()
    // 若已登录，按部署模式引导回工作台 / 应用主页
    if (auth.isAuthenticated) {
      const landing = resolveAuthenticatedLanding(auth)
      throw redirect({ to: landing.to as any, search: landing.search as any })
    }
  },
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const { t } = useTranslation('auth')
  const brand = getBrandConfig()

  useEffect(() => {
    document.title = `${t('forgotPasswordTitle', '重置密码')} - ${brand.name}`
  }, [brand.name, t])

  return <ForgotPasswordPage />
}
