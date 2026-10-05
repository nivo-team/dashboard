import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ForgotEmailPage } from '#/features/auth'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'
import { getBrandConfig } from '#/lib/brand'

/**
 * 找回邮箱路由（`/_auth/forgot-email.tsx` -> "/forgot-email"）
 *
 * 薄路由职责：
 * 1. 守卫已登录用户自动分流；
 * 2. 注入 SEO Meta 与标题信息；
 * 3. 挂载 `ForgotEmailPage` 业务组件。
 */
export const Route = createFileRoute('/_auth/forgot-email')({
  head: () => {
    const brand = getBrandConfig()
    return {
      meta: [
        {
          title: `找回邮箱 - ${brand.name}`,
        },
        {
          name: 'description',
          content: `通过关联信息找回您在 ${brand.name} 的登录邮箱`,
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
  component: ForgotEmailRoute,
})

function ForgotEmailRoute() {
  const { t } = useTranslation('auth')
  const brand = getBrandConfig()

  useEffect(() => {
    document.title = `${t('forgotEmailTitle', '找回邮箱')} - ${brand.name}`
  }, [brand.name, t])

  return <ForgotEmailPage />
}
