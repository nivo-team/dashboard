import {
  Button,
  Input,
  Select,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RouterLink } from '#/components/router-link'
import { OAuthButtons } from './oauth-buttons'
import type { OAuthProviderConfig } from './oauth-config'
import {
  apiLogin,
  completeLoginWithApp,
  getDefaultApp,
  isMultiAppEnabled,
  setAuthenticatedSession,
} from '#/lib/auth'

/** 测试账号模型定义 */
export interface DemoAccount {
  username: string
  password: string
  label?: string
}

/** 默认内置的测试账号列表，生产环境可直接通过 props 覆盖或关闭 */
export const DEFAULT_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'super admin',
    password: '123',
  },
  {
    username: 'admin',
    password: '123',
  },
  {
    username: 'user',
    password: '123',
  },
]

export interface LoginFormProps {
  /** 登录成功后的跳转重定向地址 */
  redirect?: string
  /** 登录成功后的自定义回调（可选） */
  onSuccess?: () => void

  /**
   * 是否显示快捷测试账号选择框。
   * 传 false 时彻底不渲染选择框，便于真实生产环境一键隐藏。
   */
  showDemoAccounts?: boolean
  /** 外部注入的测试账号列表，缺省时使用内置示例账号 */
  demoAccounts?: DemoAccount[]

  /** 是否显示注册跳转引导链接（默认 true） */
  showRegisterLink?: boolean
  /** 注册目标路由（默认 '/register'） */
  registerHref?: string

  /** 是否显示「忘记邮箱或密码」跳转链接行（默认 true） */
  showForgotLinks?: boolean
  /** 忘记邮箱目标路由（默认 '/forgot-email'） */
  forgotEmailHref?: string
  /** 忘记密码目标路由（默认 '/forgot-password'） */
  forgotPasswordHref?: string

  /** 是否显示第三方 OAuth 登录按钮（默认 true，若未开启任何 provider 则自动隐藏） */
  showOAuth?: boolean
  /** 自定义 OAuth 提供商列表（可选） */
  oauthProviders?: OAuthProviderConfig[]

  /** 额外容器类名 */
  className?: string
}

/**
 * 核心登录表单组件
 *
 * 封装完整的登录表单状态、校验、API 登录交互与跳转，可独立嵌入任意页面或对话框中。
 * 针对测试账号与辅助导航链接（注册 / 找回邮箱 / 找回密码）提供纯 Props 控制能力。
 */
export function LoginForm({
  redirect: redirectUrl,
  onSuccess,
  showDemoAccounts = true,
  demoAccounts = DEFAULT_DEMO_ACCOUNTS,
  showRegisterLink = true,
  registerHref = '/register',
  showForgotLinks = true,
  forgotEmailHref = '/forgot-email',
  forgotPasswordHref = '/forgot-password',
  showOAuth = true,
  oauthProviders,
  className = '',
}: LoginFormProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

  // 决定是否渲染测试账号
  const hasDemoAccounts = showDemoAccounts && demoAccounts.length > 0

  // 表单状态
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // 处理账号密码提交
  const handleLoginSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!username.trim()) {
      toast.add({
        title: t('authFailed'),
        description: t('inputAccount'),
        variant: 'error',
      })
      return
    }

    if (!password) {
      toast.add({
        title: t('authFailed'),
        description: t('inputPassword'),
        variant: 'error',
      })
      return
    }

    try {
      setIsLoading(true)

      const data = await apiLogin({
        username,
        password,
        rememberDevice,
      })

      // 单应用模式：直接使用默认应用完成选定，跳转至业务首页，避免多余的 / 路由选择
      if (!isMultiAppEnabled()) {
        const defaultApp = getDefaultApp()
        completeLoginWithApp(
          {
            token: data.token,
            user: data.user,
            apps: [defaultApp],
          },
          defaultApp.id,
        )
        onSuccess?.()
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
        // 多应用模式：暂存登录态，进入应用选择路由以获取并选定工作空间应用
        setAuthenticatedSession(data)
        onSuccess?.()
        await router.invalidate()
        navigate({
          to: '/',
          search: { redirect: redirectUrl },
        })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('authFailed')
      toast.add({
        title: t('authFailed'),
        description: errorMsg,
        variant: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 标题 */}
      <h1 className="text-center text-3xl font-semibold text-kumo-default">
        {t('signIn')}
      </h1>

      {/* 登录表单 */}
      <form onSubmit={handleLoginSubmit} className="mt-8 flex flex-col gap-5">
        {/* ====================================================================== */}
        {/* 可选的测试账号选择器（通过 showDemoAccounts 与 demoAccounts 控制）    */}
        {/* ====================================================================== */}
        {hasDemoAccounts && (
          <div className="flex flex-col gap-1.5">
            <Select<string>
              label={t('selectAccount', '测试账号')}
              placeholder={t('selectAccountPlaceholder', '选择测试账号…')}
              aria-label={t('selectAccount', '测试账号')}
              className="min-w-0 w-full"
              value={selectedAccount}
              onValueChange={(next) => {
                const accUsername = next ? String(next) : null
                setSelectedAccount(accUsername)
                if (accUsername) {
                  const acc = demoAccounts.find((a) => a.username === accUsername)
                  if (acc) {
                    setUsername(acc.username)
                    setPassword(acc.password)
                  }
                }
              }}
              items={demoAccounts.map((acc) => ({
                value: acc.username,
                label: acc.label || acc.username,
              }))}
            />
          </div>
        )}

        {/* 账号输入框 */}
        <div className="flex flex-col gap-1.5">
          <Input
            id="username"
            label={t('account', '账号')}
            aria-label={t('account', '账号')}
            placeholder=""
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (selectedAccount !== null && e.target.value !== selectedAccount) {
                setSelectedAccount(null)
              }
            }}
            disabled={isLoading}
            autoComplete="username"
            autoFocus
            required
            className="h-10 text-sm"
          />
        </div>

        {/* 密码输入框（带小眼睛显隐切换） */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            id="password-label"
            className="text-sm font-medium text-kumo-default"
          >
            {t('password')}
          </label>
          <div className="relative flex items-center">
            <input
              id="password"
              aria-labelledby="password-label"
              aria-label={t('password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (selectedAccount !== null) {
                  const acc = demoAccounts.find((a) => a.username === selectedAccount)
                  if (acc && e.target.value !== acc.password) {
                    setSelectedAccount(null)
                  }
                }
              }}
              disabled={isLoading}
              autoComplete="current-password"
              required
              className="h-10 w-full rounded-lg border border-kumo-line bg-kumo-base px-3.5 pe-10 text-sm text-kumo-default outline-none transition-all placeholder:text-kumo-subtle focus:border-transparent focus:ring-2 focus:ring-kumo-brand"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-2.5 flex size-6 items-center justify-center text-kumo-subtle transition-colors hover:text-kumo-default focus:outline-none"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? (
                <EyeSlashIcon size={18} />
              ) : (
                <EyeIcon size={18} />
              )}
            </button>
          </div>
        </div>

        {/* 在此设备上保存登录状态 */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={rememberDevice}
            onClick={() => setRememberDevice(!rememberDevice)}
            disabled={isLoading}
            className={`flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
              rememberDevice
                ? 'border-kumo-brand bg-kumo-brand text-white'
                : 'border-kumo-line bg-kumo-base hover:border-kumo-subtle'
            }`}
          >
            {rememberDevice && <CheckIcon size={12} weight="bold" />}
          </button>
          <label
            onClick={() => setRememberDevice(!rememberDevice)}
            className="cursor-pointer select-none text-sm text-kumo-subtle hover:text-kumo-default"
          >
            {t('saveDevice')}
          </label>
        </div>

        {/* 提交登录按钮 */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isLoading}
          disabled={isLoading}
          className="mt-3 w-full justify-center"
        >
          {isLoading ? t('submitting') : t('submit')}
        </Button>

        {/* ====================================================================== */}
        {/* 第三方 OAuth 登录按钮区（按配置按需展示）                             */}
        {/* ====================================================================== */}
        {showOAuth && (
          <OAuthButtons
            mode="login"
            providers={oauthProviders}
            redirect={redirectUrl}
            className="pt-1"
          />
        )}

        {/* ====================================================================== */}
        {/* 底部辅助链接区：注册引导 + 忘记邮箱/密码引导                           */}
        {/* ====================================================================== */}
        {(showRegisterLink || showForgotLinks) && (
          <div className="mt-2.5 flex flex-col items-center gap-1.5 text-center text-sm text-kumo-subtle">
            {/* 第一行：注册引导 */}
            {showRegisterLink && (
              <div>
                <span>{t('noAccount', '还没有账号？')} </span>
                <RouterLink
                  to={registerHref}
                  variant="plain"
                  className="font-semibold text-kumo-link"
                >
                  {t('toSignUp', '立即注册')}
                </RouterLink>
              </div>
            )}

            {/* 第二行：忘记邮箱或密码引导 */}
            {showForgotLinks && (
              <div>
                <span>{t('forgotPromptPrefix', '忘记了 ')}</span>
                <RouterLink
                  to={forgotEmailHref}
                  variant="inline"
                >
                  {t('forgotEmail', '邮箱')}
                </RouterLink>
                <span>{t('forgotPromptOr', ' 或 ')}</span>
                <RouterLink
                  to={forgotPasswordHref}
                  variant="inline"
                >
                  {t('forgotPassword', '密码')}
                </RouterLink>
                <span>{t('forgotPromptSuffix', '？')}</span>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
