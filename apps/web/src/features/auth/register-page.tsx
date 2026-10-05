import { RegisterForm, type RegisterFormProps } from './register-form'

export interface RegisterPageProps extends RegisterFormProps {}

/**
 * 完整注册页面视图组件
 *
 * 采用纯净单栏居中排版：
 * - 无右侧色彩或装饰展位；
 * - 注册表单（RegisterForm）水平和垂直居中在页面中央，保持视觉专注。
 */
export function RegisterPage(props: RegisterPageProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-1 items-center justify-center bg-kumo-base px-6 py-12 pt-16 sm:px-10">
      <div className="w-full max-w-105">
        <RegisterForm {...props} />
      </div>
    </div>
  )
}
