import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LoginPage } from '#/features/auth'
import { DEFAULT_APP_ID, getAuthSnapshot, isMultiAppEnabled } from '#/lib/auth'
import { getBrandConfig } from '#/lib/brand'

interface LoginSearch {
  redirect?: string
}

/**
 * 登录路由（`/_auth/login.tsx` -> "/login"）—— **薄适配层**。
 *
 * `validateSearch` / `beforeLoad` / `head` 是路由语义，留在这一层；
 * 登录表单与逻辑在 `#/features/auth`，`redirect` 通过 props 传入。
 */
export const Route = createFileRoute('/_auth/login')({
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
    // 检测到已有登录信息：单应用模式直接进入默认应用，多应用模式按是否已选应用分流
    if (auth.isAuthenticated) {
      if (!isMultiAppEnabled()) {
        const appId = auth.currentApp?.id || DEFAULT_APP_ID
        const target =
          search.redirect &&
          search.redirect.startsWith('/') &&
          search.redirect !== '/' &&
          search.redirect !== '/select-app'
            ? search.redirect
            : `/${appId}/home`
        throw redirect({ to: target as any })
      }

      if (auth.currentApp) {
        const target =
          search.redirect && search.redirect.startsWith('/')
            ? search.redirect
            : `/${auth.currentApp.id}/home`
        throw redirect({ to: target as any })
      }
      throw redirect({
        to: '/',
        search: {
          redirect: search.redirect,
        },
      })
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

  return <LoginPage redirect={redirectUrl} />
}
