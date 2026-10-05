import { AppleLogo, GithubLogo, GoogleLogo } from '@phosphor-icons/react'
import type { ComponentType } from 'react'

export type OAuthProviderId = 'google' | 'github' | 'apple'

export interface OAuthProviderConfig {
  id: OAuthProviderId
  name: string
  icon: ComponentType<{ size?: number; className?: string }>
  /** 是否启用（由环境变量 VITE_OAUTH_*_ENABLED 控制） */
  enabled: boolean
}

/** 所有支持的第三方平台元数据静态注册表 */
const ALL_PROVIDERS: readonly OAuthProviderConfig[] = [
  {
    id: 'google',
    name: 'Google',
    icon: GoogleLogo,
    enabled: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: GithubLogo,
    enabled: false,
  },
  {
    id: 'apple',
    name: 'Apple',
    icon: AppleLogo,
    enabled: false,
  },
] as const

/**
 * 依据环境变量动态获取当前已启用的 OAuth Providers
 */
export function getEnabledOAuthProviders(): OAuthProviderConfig[] {
  const isGoogle = import.meta.env.VITE_OAUTH_GOOGLE_ENABLED === 'true' || import.meta.env.VITE_OAUTH_GOOGLE_ENABLED === '1'
  const isGithub = import.meta.env.VITE_OAUTH_GITHUB_ENABLED === 'true' || import.meta.env.VITE_OAUTH_GITHUB_ENABLED === '1'
  const isApple = import.meta.env.VITE_OAUTH_APPLE_ENABLED === 'true' || import.meta.env.VITE_OAUTH_APPLE_ENABLED === '1'

  const enabledMap: Record<OAuthProviderId, boolean> = {
    google: isGoogle,
    github: isGithub,
    apple: isApple,
  }

  return ALL_PROVIDERS.map((provider) => ({
    ...provider,
    enabled: enabledMap[provider.id],
  })).filter((provider) => provider.enabled)
}

/**
 * React Hook 获取已启用的 OAuth Providers
 */
export function useOAuthProviders(): OAuthProviderConfig[] {
  return getEnabledOAuthProviders()
}
