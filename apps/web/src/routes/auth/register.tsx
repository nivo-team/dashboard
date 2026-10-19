import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RegisterPage } from '#/features/auth'
import { getAuthSnapshot, resolveAuthenticatedLanding } from '#/lib/auth'
import { isMultiAccountEnabled } from '#/lib/app-config'
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
    // 单账号部署不开放注册：直接回登录页
    if (!isMultiAccountEnabled()) throw redirect({ to: '/auth/login' })

    const auth = getAuthSnapshot()
    // 若已登录，按部署模式引导回工作台 / 应用主页
    if (auth.isAuthenticated) {
      const landing = resolveAuthenticatedLanding(auth)
      throw redirect({ to: landing.to as any, search: landing.search as any })
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
