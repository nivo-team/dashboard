import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RegisterPage } from '#/features/auth'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'
import { getBrandConfig } from '#/lib/brand'

/**
 * 注册路由（`/auth/register.tsx` -> "/auth/register"）—— **薄适配层**。
 *
 * 注册表单与交互逻辑收拢在 `#/features/auth`，路由仅负责导航守卫、SEO 与页面挂载。
 */
export const Route = createFileRoute('/auth/register')({
  head: () => {
    const brand = getBrandConfig()
    return {
      meta: [
        {
          title: `注册 - ${brand.name}`,
        },
        {
          name: 'description',
          content: `创建 ${brand.name} 账号`,
        },
      ],
    }
  },
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
  const { t } = useTranslation('auth')
  const brand = getBrandConfig()

  useEffect(() => {
    document.title = `${t('signUp', '注册')} - ${brand.name}`
  }, [brand.name, t])

  return <RegisterPage />
}
