import {
  Button,
  Input,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react'
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  apiLogin,
  completeLoginWithApp,
  DEFAULT_APP_ID,
  getAuthSnapshot,
  getDefaultApp,
  isMultiAppEnabled,
  setAuthenticatedSession,
} from '#/lib/auth'

interface LoginSearch {
  redirect?: string
}

export const Route = createFileRoute('/_auth/login')({
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
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const { redirect: redirectUrl } = Route.useSearch()
  const { t } = useTranslation('auth')
  const toast = useKumoToastManager()

  // 表单状态
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
      // 调用远端登录校验接口，验证身份并获取授权凭证
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
        router.invalidate()
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
        router.invalidate()
        navigate({
          to: '/',
          search: { redirect: redirectUrl },
        })
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : t('authFailed')
      toast.add({
        title: t('authFailed'),
        description: errorText,
        variant: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full bg-kumo-base text-kumo-default">
      {/* ====================================================================== */}
      {/* 左侧：表单主交互区域（PC 居中占宽约 50%，移动端 100% 流式）           */}
      {/* ====================================================================== */}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 md:px-16 lg:max-w-[50%] lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-100">
          <div className="flex flex-col">
            {/* 大号居中标题（参考设计图排版） */}
            <h1 className="text-center text-3xl font-semibold text-kumo-default">
              {t('signIn')}
            </h1>

            {/* 核心登录表单：只包含账号和密码 */}
            <form onSubmit={handleLoginSubmit} className="mt-8 flex flex-col gap-5">
              {/* 账号输入框 */}
              <div className="flex flex-col gap-1.5">
                <Input
                  id="username"
                  label={t('account', '账号')}
                  aria-label={t('account', '账号')}
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
                    onChange={(e) => setPassword(e.target.value)}
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
                  onClick={() => setRememberDevice((prev) => !prev)}
                  className={`flex size-4.5 shrink-0 items-center justify-center rounded transition-colors ${
                    rememberDevice
                      ? 'bg-kumo-contrast text-kumo-base'
                      : 'border border-kumo-line bg-kumo-base'
                  }`}
                >
                  {rememberDevice ? <CheckIcon size={12} weight="bold" /> : null}
                </button>
                <span
                  onClick={() => setRememberDevice((prev) => !prev)}
                  className="cursor-pointer select-none text-sm text-kumo-default"
                >
                  {t('saveDevice')}
                </span>
              </div>

              {/* 提交按钮（Kumo UI Button） */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                className="mt-3 w-full justify-center"
              >
                {isLoading ? t('submitting') : t('submit')}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* 右侧：纯色彩与视觉排版展位（高饱和橙色与几何网格占位，仅保留大标题）  */}
      {/* ====================================================================== */}
      <div className="relative hidden flex-1 select-none flex-col justify-center overflow-hidden bg-gradient-to-br from-[#FA6400] via-[#F45500] to-[#E34000] p-12 text-white lg:flex xl:p-16">
        {/* 背景几何线条球体网格纯色占位 */}
        <div className="pointer-events-none absolute -right-20 top-1/2 size-160 -translate-y-1/2 opacity-25">
          <svg viewBox="0 0 400 400" className="size-full fill-none stroke-white" strokeWidth="0.8">
            <circle cx="200" cy="200" r="180" strokeDasharray="3 3" />
            <circle cx="200" cy="200" r="140" />
            <circle cx="200" cy="200" r="100" strokeDasharray="4 4" />
            <circle cx="200" cy="200" r="60" />
            <ellipse cx="200" cy="200" rx="180" ry="80" strokeDasharray="2 2" />
            <ellipse cx="200" cy="200" rx="180" ry="130" strokeDasharray="3 3" />
            <line x1="20" y1="200" x2="380" y2="200" />
            <line x1="200" y1="20" x2="200" y2="380" />
          </svg>
        </div>

        {/* 仅保留大标题 */}
        <div className="relative z-10 my-auto max-w-lg" dir="ltr">
          <h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
            Where the Internet's builders connect.
          </h2>
        </div>
      </div>
    </div>
  )
}
