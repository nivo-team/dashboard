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
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  apiLogin,
  completeLoginWithApp,
  getDefaultApp,
  isMultiAppEnabled,
  setAuthenticatedSession,
} from '#/lib/auth'

/**
 * ============================================================================
 * DEMO ONLY: 快捷填充测试账号配置
 * 生产环境/真实项目中需完全删除此配置及相关 UI 交互
 * ============================================================================
 */
const DEMO_ACCOUNTS = [
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
] as const

export interface LoginFormProps {
  /** 登录成功后的跳转重定向地址 */
  redirect?: string
  /** 登录成功后的自定义回调（可选） */
  onSuccess?: () => void
  /** 是否隐藏前往注册的链接（默认 false） */
  hideRegisterLink?: boolean
  /** 额外容器类名 */
  className?: string
}

/**
 * 核心登录表单组件
 *
 * 封装完整的登录表单状态、校验、API 登录交互与跳转，可独立嵌入任意页面或对话框中。
 */
export function LoginForm({
  redirect: redirectUrl,
  onSuccess,
  hideRegisterLink = false,
  className = '',
}: LoginFormProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

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

      const response = await apiLogin({
        body: {
          username: username.trim(),
          password,
        },
      })

      if (response.code === 0 && response.data?.user) {
        const user = response.data.user

        if (isMultiAppEnabled()) {
          const defaultApp = getDefaultApp()
          if (defaultApp) {
            completeLoginWithApp(user, defaultApp.id)
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
            setAuthenticatedSession(user)
            onSuccess?.()
            await router.invalidate()
            navigate({
              to: '/select-app',
              search: {
                redirect: redirectUrl,
              },
            })
          }
        } else {
          setAuthenticatedSession(user)
          onSuccess?.()
          await router.invalidate()
          const target =
            redirectUrl && redirectUrl.startsWith('/') && redirectUrl !== '/'
              ? redirectUrl
              : '/home'
          navigate({ to: target as any })
        }
      } else {
        toast.add({
          title: t('authFailed'),
          description: response.message || t('authFailed'),
          variant: 'error',
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
        {/* DEMO ONLY: 快捷选择测试账号                                              */}
        {/* ====================================================================== */}
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
                const acc = DEMO_ACCOUNTS.find((a) => a.username === accUsername)
                if (acc) {
                  setUsername(acc.username)
                  setPassword(acc.password)
                }
              }
            }}
            items={DEMO_ACCOUNTS.map((acc) => ({
              value: acc.username,
              label: acc.username,
            }))}
          />
        </div>

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
                  const acc = DEMO_ACCOUNTS.find((a) => a.username === selectedAccount)
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
        <div className="mt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="h-11 w-full text-base font-medium shadow-sm transition-transform active:scale-[0.99]"
            loading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? t('submitting') : t('submit')}
          </Button>
        </div>

        {/* 注册跳转引导 */}
        {!hideRegisterLink && (
          <div className="mt-2 text-center text-sm text-kumo-subtle">
            <span>{t('noAccount', '还没有账号？')} </span>
            <Link
              to="/register"
              className="font-medium text-kumo-default underline underline-offset-4 hover:text-kumo-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand rounded"
            >
              {t('toSignUp', '立即注册')}
            </Link>
          </div>
        )}
      </form>
    </div>
  )
}
