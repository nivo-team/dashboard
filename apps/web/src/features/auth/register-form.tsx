import {
  Button,
  Input,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface RegisterFormProps {
  /** 注册成功后的自定义回调（可选） */
  onSuccess?: () => void
  /** 是否隐藏前往登录的链接（默认 false） */
  hideLoginLink?: boolean
  /** 额外容器类名 */
  className?: string
}

/**
 * 核心注册表单组件
 *
 * 封装完整的注册表单状态、校验、API 注册交互与跳转，可独立嵌入任意页面中。
 */
export function RegisterForm({
  onSuccess,
  hideLoginLink = false,
  className = '',
}: RegisterFormProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

  // 表单状态
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // 处理注册提交
  const handleRegisterSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()

    if (!trimmedUsername) {
      toast.add({
        title: t('authFailed', '提交失败'),
        description: t('inputUsername', '请输入用户名'),
        variant: 'error',
      })
      return
    }

    if (!trimmedEmail) {
      toast.add({
        title: t('authFailed', '提交失败'),
        description: t('inputEmail', '请输入邮箱地址'),
        variant: 'error',
      })
      return
    }

    if (!password) {
      toast.add({
        title: t('authFailed', '提交失败'),
        description: t('inputPassword', '请输入登录密码'),
        variant: 'error',
      })
      return
    }

    if (password !== confirmPassword) {
      toast.add({
        title: t('authFailed', '提交失败'),
        description: t('passwordMismatch', '两次输入的密码不一致'),
        variant: 'error',
      })
      return
    }

    try {
      setIsLoading(true)

      // 模拟注册 API 请求延迟，真实业务中可替换为 apiRegister 接口调用
      await new Promise((resolve) => setTimeout(resolve, 800))

      toast.add({
        title: t('signUpSuccess', '账号注册成功'),
        description: t('signUpSuccessDesc', '已成功注册，即将为您跳转…'),
        variant: 'success',
      })

      onSuccess?.()

      // 注册成功引导跳转至登录页
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 1000)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('authFailed', '注册失败')
      toast.add({
        title: t('authFailed', '注册失败'),
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
        {t('signUpTitle', '创建新账号')}
      </h1>

      {/* 注册表单 */}
      <form onSubmit={handleRegisterSubmit} className="mt-8 flex flex-col gap-4.5">
        {/* 用户名输入框 */}
        <div className="flex flex-col gap-1.5">
          <Input
            id="register-username"
            label={t('username', '用户名')}
            aria-label={t('username', '用户名')}
            placeholder=""
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
            autoFocus
            required
            className="h-10 text-sm"
          />
        </div>

        {/* 邮箱输入框 */}
        <div className="flex flex-col gap-1.5">
          <Input
            id="register-email"
            type="email"
            label={t('emailAddress', '邮箱地址')}
            aria-label={t('emailAddress', '邮箱地址')}
            placeholder=""
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email"
            required
            className="h-10 text-sm"
          />
        </div>

        {/* 密码输入框 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="register-password"
            id="register-password-label"
            className="text-sm font-medium text-kumo-default"
          >
            {t('password', '密码')}
          </label>
          <div className="relative flex items-center">
            <input
              id="register-password"
              aria-labelledby="register-password-label"
              aria-label={t('password', '密码')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
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

        {/* 确认密码输入框 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="register-confirm-password"
            id="register-confirm-password-label"
            className="text-sm font-medium text-kumo-default"
          >
            {t('confirmPassword', '确认密码')}
          </label>
          <div className="relative flex items-center">
            <input
              id="register-confirm-password"
              aria-labelledby="register-confirm-password-label"
              aria-label={t('confirmPassword', '确认密码')}
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              required
              className="h-10 w-full rounded-lg border border-kumo-line bg-kumo-base px-3.5 pe-10 text-sm text-kumo-default outline-none transition-all placeholder:text-kumo-subtle focus:border-transparent focus:ring-2 focus:ring-kumo-brand"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute end-2.5 flex size-6 items-center justify-center text-kumo-subtle transition-colors hover:text-kumo-default focus:outline-none"
              aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
            >
              {showConfirmPassword ? (
                <EyeSlashIcon size={18} />
              ) : (
                <EyeIcon size={18} />
              )}
            </button>
          </div>
        </div>

        {/* 提交注册按钮 */}
        <div className="mt-2.5">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="h-11 w-full text-base font-medium shadow-sm transition-transform active:scale-[0.99]"
            loading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? t('signingUp', '正在创建账号…') : t('signUpSubmit', '注 册')}
          </Button>
        </div>

        {/* 登录跳转引导 */}
        {!hideLoginLink && (
          <div className="mt-2 text-center text-sm text-kumo-subtle">
            <span>{t('hasAccount', '已有账号？')} </span>
            <Link
              to="/login"
              className="font-medium text-kumo-default underline underline-offset-4 hover:text-kumo-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand rounded"
            >
              {t('toSignIn', '立即登录')}
            </Link>
          </div>
        )}
      </form>
    </div>
  )
}
