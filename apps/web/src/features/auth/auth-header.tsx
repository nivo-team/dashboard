import { Link } from '@tanstack/react-router'
import { LocaleSwitcher } from '#/components/locale-switcher'
import { ThemeSwitcher } from '#/components/theme-switcher'
import { useBrand } from '#/lib/brand'

interface AuthHeaderProps {
  /** 额外的外层样式类 */
  className?: string
  /** 是否显示底部细边框（默认 true） */
  bordered?: boolean
}

/**
 * 认证页面（登录 / 注册）独立通用顶部导航栏
 *
 * 布局契约：
 * - 左侧：全局系统品牌 Logo 图标 + 品牌全称（点击跳转回登录页/首页）；
 * - 右侧：多语言切换下拉（LocaleSwitcher）+ 明暗主题切换下拉（ThemeSwitcher）。
 * - 纯净解耦：使用 Kumo 语义颜色令牌，不依赖任何特定子页面的背景或浮动打补丁。
 */
export function AuthHeader({ className = '', bordered = true }: AuthHeaderProps) {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon

  return (
    <header
      className={`relative z-20 flex h-16 w-full shrink-0 items-center justify-between px-6 sm:px-10 ${
        bordered ? 'border-b border-kumo-line' : ''
      } bg-kumo-base ${className}`}
    >
      {/* 最左侧：品牌 Logo 与名称 */}
      <Link
        to="/login"
        className="flex items-center gap-2.5 text-kumo-default transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand rounded-lg"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-kumo-tint text-kumo-default">
          <LogoIcon size={20} />
        </span>
        <span className="font-semibold text-base text-kumo-default">
          {brand.name}
        </span>
      </Link>

      {/* 最右侧：语言切换与主题切换 */}
      <div className="flex items-center gap-1.5">
        <LocaleSwitcher />
        <ThemeSwitcher />
      </div>
    </header>
  )
}
