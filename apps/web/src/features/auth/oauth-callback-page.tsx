import { Button, Loader, useKumoToastManager } from '@cloudflare/kumo'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RouterLink } from '#/components/router-link'
import {
  completeLoginWithApp,
  getDefaultApp,
  isMultiAppEnabled,
  setAuthenticatedSession,
  type UserInfo,
} from '#/lib/auth'
import type { OAuthProviderId } from './oauth-config'

export interface OAuthCallbackPageProps {
  /** 当前回调的第三方平台 ID */
  provider: OAuthProviderId
  /** 授权码（由第三方提供商通过 URL 传入） */
  code?: string
  /** 防跨站伪造状态参数 */
  state?: string
  /** 授权成功后的最终重定向目标 */
  redirect?: string
}

/**
 * 通用 OAuth 回调处理核心页面视图
 *
 * 承载授权码换取 Token、装配会话凭据、错误兜底与单/多应用工作台分流跳转。
 */
export function OAuthCallbackPage({
  provider,
  code,
  redirect: redirectUrl,
}: OAuthCallbackPageProps) {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const router = useRouter()
  const toast = useKumoToastManager()

  const [isProcessing, setIsProcessing] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function processCallback() {
      try {
        setIsProcessing(true)
        setErrorMessage(null)

        // 模拟 OAuth 凭据交换网络请求（生产环境对接真实后端 API）
        await new Promise((resolve) => setTimeout(resolve, 800))

        if (!code) {
          throw new Error('未检测到有效的授权码 (Missing authorization code)')
        }

        // 组装模拟用户信息
        const mockUser: UserInfo = {
          id: `oauth_${provider}_${Date.now()}`,
          name: `${provider.toUpperCase()} 用户`,
          roles: ['Admin'],
          role: 'Admin',
        }

        const mockToken = `oauth_token_${provider}_${Date.now()}`

        if (!isMounted) return

        if (!isMultiAppEnabled()) {
          const defaultApp = getDefaultApp()
          completeLoginWithApp(
            {
              token: mockToken,
              user: mockUser,
              apps: [defaultApp],
            },
            defaultApp.id,
          )
          await router.invalidate()
          const target =
            redirectUrl &&
            redirectUrl.startsWith('/') &&
            redirectUrl !== '/' &&
            redirectUrl !== '/select-app'
              ? redirectUrl
              : `/${defaultApp.id}/home`
          navigate({ to: target as any })
        } else {
          setAuthenticatedSession({
            token: mockToken,
            user: mockUser,
            apps: [getDefaultApp()],
          })
          await router.invalidate()
          navigate({
            to: '/',
            search: { redirect: redirectUrl },
          })
        }
      } catch (err: unknown) {
        if (!isMounted) return
        const msg = err instanceof Error ? err.message : t('oauthFailed', '第三方授权登录失败')
        setErrorMessage(msg)
        toast.add({
          title: t('oauthFailed', '第三方授权登录失败'),
          description: msg,
          variant: 'error',
        })
      } finally {
        if (isMounted) {
          setIsProcessing(false)
        }
      }
    }

    processCallback()

    return () => {
      isMounted = false
    }
  }, [code, navigate, provider, redirectUrl, router, t, toast])

  const providerDisplayName =
    provider === 'google'
      ? 'Google'
      : provider === 'github'
        ? 'GitHub'
        : provider === 'apple'
          ? 'Apple'
          : provider

  return (
    <div className="relative flex min-h-screen w-full flex-1 items-center justify-center bg-kumo-base px-6 py-12 pt-16 sm:px-10">
      <div className="flex w-full max-w-95 flex-col items-center rounded-2xl border border-kumo-line bg-kumo-canvas/50 p-8 text-center shadow-sm">
        {isProcessing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader className="size-8 text-kumo-brand" />
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold text-kumo-default">
                {t('oauthProcessing', { provider: providerDisplayName })}
              </h2>
              <p className="text-sm text-kumo-subtle">
                {t('oauthProcessingDesc', '正在与第三方服务交换凭据，请稍候…')}
              </p>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-kumo-tint text-kumo-danger">
              <span className="text-xl font-semibold">!</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold text-kumo-default">
                {t('oauthFailed', '第三方授权登录失败')}
              </h2>
              <p className="text-sm text-kumo-subtle">{errorMessage}</p>
            </div>
            <RouterLink
              to="/login"
              variant="plain"
              className="mt-2 inline-flex items-center justify-center rounded-lg border border-kumo-line bg-kumo-base px-4 py-2 font-medium text-sm text-kumo-default hover:bg-kumo-tint"
            >
              {t('oauthRetry', '返回重新登录')}
            </RouterLink>
          </div>
        ) : null}
      </div>
    </div>
  )
}
