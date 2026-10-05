import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ForgotPasswordPage } from '#/features/auth'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'
import { getBrandConfig } from '#/lib/brand'

/**
 * 重置密码路由（`/_auth/forgot-password.tsx` -> "/forgot-password"）
 *
 * 薄路由职责：
 * 1. 守卫已登录用户自动分流；
 * 2. 注入 SEO Meta 与标题信息；
 * 3. 挂载 `ForgotPasswordPage` 业务组件。
 */
export const Route = createFileRoute('/_auth/forgot-password')({
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
    const auth = getAuthSnapshot()
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
