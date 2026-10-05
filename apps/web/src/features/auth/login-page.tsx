import { LoginForm } from './login-form'

export interface LoginPageProps {
  /** 登录成功后的跳转目标地址 */
  redirect?: string
}

/**
 * 完整登录页面视图组件
 *
 * 采用双栏全屏排版：
 * - 左侧：居中登录核心表单区（LoginForm）
 * - 右侧：大面积视觉展台与标语展示（大屏幕显示，移动端自动隐藏，贯穿全屏）
 */
export function LoginPage({ redirect: redirectUrl }: LoginPageProps) {
  return (
    <div className="relative flex min-h-screen w-full bg-kumo-base text-kumo-default">
      {/* ====================================================================== */}
      {/* 左侧：表单主交互区域（PC 居中占宽约 50%，移动端 100% 流式）           */}
      {/* ====================================================================== */}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 pt-16 sm:px-12 md:px-16 lg:max-w-[50%] lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-100">
          <LoginForm redirect={redirectUrl} />
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

        {/* 展台大标题 */}
        <div className="relative z-10 my-auto max-w-lg" dir="ltr">
          <h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
            Where the Internet's builders connect.
          </h2>
        </div>
      </div>
    </div>
  )
}
