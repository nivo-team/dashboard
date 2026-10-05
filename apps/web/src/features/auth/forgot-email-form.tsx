import {
  Button,
  Input,
  useKumoToastManager,
} from '@cloudflare/kumo'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ForgotEmailFormProps {
  /** 提交成功后的自定义回调 */
  onSuccess?: (foundEmail?: string) => void
  /** 返回登录的路由（默认 '/login'） */
  loginHref?: string
  /** 额外容器类名 */
  className?: string
}

/**
 * 找回邮箱表单组件
 */
export function ForgotEmailForm({
  onSuccess,
  loginHref = '/login',
  className = '',
}: ForgotEmailFormProps) {
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

  const [identity, setIdentity] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [foundEmail, setFoundEmail] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    const trimmed = identity.trim()
    if (!trimmed) {
      toast.add({
        title: t('authFailed', '提示'),
        description: t('inputPhoneOrIdentity', '请输入手机号码或关联信息'),
        variant: 'error',
      })
      return
    }

    try {
      setIsLoading(true)
      // 模拟寻回邮箱网络请求
      await new Promise((resolve) => setTimeout(resolve, 800))

      const mockEmail = `${trimmed.replace(/\s+/g, '').slice(0, 4)}***@example.com`
      setFoundEmail(mockEmail)
      onSuccess?.(mockEmail)
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
        {t('forgotEmailTitle', '找回邮箱')}
      </h1>
      <p className="mt-2 text-center text-sm text-kumo-subtle">
        {t('forgotEmailDesc', '请输入与您账号绑定的手机号码或辅助安全信息以寻回登录邮箱')}
      </p>

      {foundEmail ? (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-kumo-line bg-kumo-tint p-6 text-center">
          <p className="text-sm text-kumo-subtle">查询成功，与该信息绑定的账号邮箱为：</p>
          <span className="font-semibold text-base text-kumo-brand">{foundEmail}</span>
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
              id="identity"
              label={t('phoneOrIdentity', '手机号码或关联信息')}
              aria-label={t('phoneOrIdentity', '手机号码或关联信息')}
              placeholder=""
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              disabled={isLoading}
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
            {isLoading ? t('findingEmail', '正在查询…') : t('findEmailSubmit', '找回邮箱')}
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
