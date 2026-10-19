import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LoginPage } from '#/features/auth'
import { getAuthSnapshot, resolveAuthenticatedLanding } from '#/lib/auth'
import { getAuthUiOptions } from '#/lib/app-config'
import { getBrandConfig } from '#/lib/brand'

interface LoginSearch {
  redirect?: string
}

/**
 * 登录路由（`/auth/login.tsx` -> "/auth/login"）—— **薄适配层**。
 *
 * `validateSearch` / `beforeLoad` / `head` 是路由语义，留在这一层；
 * 登录表单与逻辑在 `#/features/auth`，`redirect` 通过 props 传入。
 */
export const Route = createFileRoute('/auth/login')({
  head: () => {
    const brand = getBrandConfig()
    return {
      meta: [
        {
          title: `登录 - ${brand.name}`,
        },
        {
          name: 'description',
          content: `${brand.name} 登录入口`,
        },
      ],
    }
  },
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    return {
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    }
  },
  beforeLoad: ({ search }) => {
    const auth = getAuthSnapshot()
    // 已登录：按部署模式推导落点（单应用 / 已选应用 / 回 `/` 继续选择）
    if (auth.isAuthenticated) {
      const landing = resolveAuthenticatedLanding(auth, search.redirect)
      throw redirect({ to: landing.to as any, search: landing.search as any })
    }
  },
  component: LoginRoute,
})

/** 只做取参：登录表单与逻辑在 `#/features/auth`。 */
function LoginRoute() {
  const { redirect: redirectUrl } = Route.useSearch()
  const { t } = useTranslation('auth')
  const brand = getBrandConfig()

  useEffect(() => {
    document.title = `${t('signIn', '登录')} - ${brand.name}`
  }, [brand.name, t])

  return <LoginPage redirect={redirectUrl} {...getAuthUiOptions()} />
}
