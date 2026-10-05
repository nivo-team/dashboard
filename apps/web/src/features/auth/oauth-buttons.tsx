import { Button } from '@cloudflare/kumo'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useOAuthProviders,
  type OAuthProviderConfig,
  type OAuthProviderId,
} from './oauth-config'

export interface OAuthButtonsProps {
  /** 模式：登录态还是注册态 */
  mode?: 'login' | 'signup'
  /** 自定义启用的提供商列表（可选，默认读取 env 开启列表） */
  providers?: OAuthProviderConfig[]
  /** 登录/注册成功后的重定向目标 */
  redirect?: string
  /** 额外容器类名 */
  className?: string
}

/**
 * 社交登录/注册按钮组组件
 *
 * 依据环境变量自动启闭 Google、GitHub、Apple 等入口，当无开启项时自动静默不渲染。
 */
export function OAuthButtons({
  mode = 'login',
  providers: customProviders,
  redirect: redirectUrl,
  className = '',
}: OAuthButtonsProps) {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const enabledProviders = customProviders ?? useOAuthProviders()

  // 若无启用的提供商，彻底不渲染任何 DOM
  if (enabledProviders.length === 0) {
    return null
  }

  const handleProviderClick = (providerId: OAuthProviderId) => {
    // 真实生产环境：可在此重定向至后端 /oauth/:provider/authorize 授权地址
    // 模板开发环境：自动跳转至统一的回调路由并携带模拟 code 走通完整会话装配流程
    const targetUrl = `/oauth/${providerId}/callback`
    navigate({
      to: targetUrl as any,
      search: {
        code: `mock_code_${providerId}_${Date.now()}`,
        redirect: redirectUrl,
      },
    })
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* 分隔线与文字 */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-kumo-line" />
        </div>
        <div className="relative bg-kumo-base px-3 text-xs text-kumo-subtle select-none">
          {t('orContinueWith', '或使用以下方式继续')}
        </div>
      </div>

      {/* 按钮列表 */}
      <div
        className={`grid gap-2.5 ${
          enabledProviders.length === 1
            ? 'grid-cols-1'
            : enabledProviders.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-3'
        }`}
      >
        {enabledProviders.map((provider) => {
          const Icon = provider.icon
          const actionText =
            mode === 'signup'
              ? t('signUpWithProvider', { provider: provider.name })
              : t('loginWithProvider', { provider: provider.name })

          return (
            <Button
              key={provider.id}
              type="button"
              variant="secondary"
              size="md"
              aria-label={actionText}
              title={actionText}
              onClick={() => handleProviderClick(provider.id)}
              className="flex h-10 w-full items-center justify-center gap-2 border-kumo-line bg-kumo-base hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand"
            >
              <Icon size={18} className="shrink-0 text-kumo-default" />
              <span className="truncate text-sm font-medium text-kumo-default">
                {provider.name}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
