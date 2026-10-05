import { ForgotPasswordForm, type ForgotPasswordFormProps } from './forgot-password-form'

export interface ForgotPasswordPageProps extends ForgotPasswordFormProps {}

/**
 * 完整找回密码页面视图组件
 *
 * 采用单栏居中排版，与 RegisterPage 风格一致。
 */
export function ForgotPasswordPage(props: ForgotPasswordPageProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-1 items-center justify-center bg-kumo-base px-6 py-12 pt-16 sm:px-10">
      <div className="w-full max-w-105">
        <ForgotPasswordForm {...props} />
      </div>
    </div>
  )
}
