import { createFileRoute, redirect } from '@tanstack/react-router'
import { OAuthCallbackPage, type OAuthProviderId } from '#/features/auth'
import { getBrandConfig } from '#/lib/brand'

interface OAuthCallbackSearch {
  code?: string
  state?: string
  redirect?: string
}

const VALID_PROVIDERS: readonly OAuthProviderId[] = ['google', 'github', 'apple']

/**
 * 通用 OAuth 第三方授权回调薄路由
 *
 * 匹配路径：`/_auth/oauth/:provider/callback`
 * 支持 google、github、apple 等任意启用的平台回调处理。
 */
export const Route = createFileRoute('/_auth/oauth/$provider/callback')({
  validateSearch: (search: Record<string, unknown>): OAuthCallbackSearch => {
    return {
      code: typeof search.code === 'string' ? search.code : undefined,
      state: typeof search.state === 'string' ? search.state : undefined,
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    }
  },
  head: ({ params }) => {
    const brand = getBrandConfig()
    const providerLabel = params.provider.toUpperCase()
    return {
      meta: [
        {
          title: `${providerLabel} 授权验证 - ${brand.name}`,
        },
        {
          name: 'description',
          content: `${brand.name} 第三方授权验证`,
        },
      ],
    }
  },
  beforeLoad: ({ params }) => {
    // 校验 provider 是否合法，非合法提供商安全重定向至 /login
    if (!VALID_PROVIDERS.includes(params.provider as OAuthProviderId)) {
      throw redirect({ to: '/login' })
    }
  },
  component: OAuthCallbackRoute,
})

function OAuthCallbackRoute() {
  const { provider } = Route.useParams()
  const { code, state, redirect: redirectUrl } = Route.useSearch()

  return (
    <OAuthCallbackPage
      provider={provider as OAuthProviderId}
      code={code}
      state={state}
      redirect={redirectUrl}
    />
  )
}
