import {
  Button,
  Input,
  useKumoToastManager,
} from '@cloudflare/kumo'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ForgotPasswordFormProps {
  /** 提交成功后的自定义回调 */
  onSuccess?: (email: string) => void
  /** 返回登录的路由（默认 '/login'） */
  loginHref?: string
  /** 额外容器类名 */
  className?: string
}

/**
 * 找回密码（重置密码）表单组件
 */
export function ForgotPasswordForm({
  onSuccess,
  loginHref = '/login',
  className = '',
}: ForgotPasswordFormProps) {
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      toast.add({
        title: t('authFailed', '提示'),
        description: t('inputEmail', '请输入邮箱地址'),
        variant: 'error',
      })
      return
    }

    try {
      setIsLoading(true)
      // 模拟发送重置密码邮件网络请求
      await new Promise((resolve) => setTimeout(resolve, 800))

      setIsSent(true)
      toast.add({
        title: t('resetLinkSent', '重置链接已发送'),
        description: t('resetLinkSentDesc', '密码重置邮件已发送至您的邮箱，请查收'),
        variant: 'success',
      })
      onSuccess?.(trimmedEmail)
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
      <h1 className="text-center text-3xl font-semibold text-kumo-default">
        {t('forgotPasswordTitle', '重置密码')}
      </h1>
      <p className="mt-2 text-center text-sm text-kumo-subtle">
        {t('forgotPasswordDesc', '请输入您的注册邮箱，我们将向您发送重置密码的邮件链接')}
      </p>

      {isSent ? (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-kumo-line bg-kumo-tint p-6 text-center">
          <p className="text-sm text-kumo-subtle leading-relaxed">
            {t('resetLinkSentDesc', '密码重置邮件已发送至您的邮箱，请查收并按照邮件指引操作')}
          </p>
          <span className="font-semibold text-base text-kumo-brand">{email}</span>
          <Link
            to={loginHref as any}
            className="mt-2 inline-flex items-center justify-center font-medium text-sm text-kumo-default underline underline-offset-4 hover:text-kumo-brand"
          >
            {t('backToLogin', '返回登录')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Input
              id="reset-email"
              type="email"
              label={t('emailAddress', '邮箱地址')}
              aria-label={t('emailAddress', '邮箱地址')}
              placeholder=""
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
              autoFocus
              required
              className="h-10 text-sm"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            disabled={isLoading}
            className="mt-3 w-full justify-center"
          >
            {isLoading ? t('sendingResetLink', '正在发送…') : t('sendResetLinkSubmit', '发送重置链接')}
          </Button>

          <div className="mt-2 text-center text-sm text-kumo-subtle">
            <Link
              to={loginHref as any}
              className="font-medium text-kumo-default underline underline-offset-4 hover:text-kumo-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand rounded"
            >
              {t('backToLogin', '返回登录')}
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
