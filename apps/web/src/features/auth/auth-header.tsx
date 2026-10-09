import { useRouterState } from '@tanstack/react-router'
import { LocaleSwitcher } from '#/components/locale-switcher'
import { RouterLink } from '#/components/router-link'
import { ThemeSwitcher } from '#/components/theme-switcher'
import { useBrand } from '#/lib/brand'
import { cn } from '#/lib/cn'
import { handleDesktopHeaderDoubleClick, isDesktop } from '#/lib/desktop-bridge'

export interface AuthHeaderProps {
  /** 额外的外层样式类 */
  className?: string
  /**
   * 是否在 lg 及以上宽屏对右侧切换器启用白色高对比度样式（适配双栏登录页右侧高饱和度色彩展台）。
   * 缺省时自动根据当前路由是否为 /login 判定。
   */
  rightContrastOnLg?: boolean
}

/**
 * 认证页面（登录 / 注册）独立通用顶部导航栏
 *
 * 视觉风格：
 * - 纯净无背景：`fixed top-0 inset-x-0` 悬浮在页面最顶层，无背景色与边框；
 * - 最左侧：系统品牌 Logo 图标 + 品牌全称（点击跳转回登录页/首页）；
 * - 最右侧：多语言切换下拉（LocaleSwitcher）+ 明暗主题切换下拉（ThemeSwitcher）；
 * - 外层穿透（pointer-events-none），内部操作按钮响应点击（pointer-events-auto）。
 */
export function AuthHeader({ className = '', rightContrastOnLg }: AuthHeaderProps) {
  const brand = useBrand()
  const LogoIcon = brand.logoIcon
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSplitLogin = rightContrastOnLg ?? (pathname === '/login' || pathname.endsWith('/login'))

  const switcherClassName = isSplitLogin
    ? 'text-kumo-default lg:text-white lg:hover:bg-white/10 lg:active:bg-white/20'
    : 'text-kumo-default'

  return (
    <header
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-between px-6 sm:px-10',
        isDesktop() ? 'select-none drag' : 'pointer-events-none',
        isDesktop() && 'ps-[var(--shell-traffic-light-w,78px)]',
        className,
      )}
    >
      {/* 最左侧：纯净品牌 Logo 图标（无背景、无文字） */}
      <div className="pointer-events-auto no-drag">
        <RouterLink
          to="/login"
          variant="plain"
          aria-label={brand.name}
          title={brand.name}
          className="flex items-center text-kumo-default transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand rounded-lg p-1 no-drag"
        >
          <LogoIcon size={24} className="shrink-0 text-kumo-default" />
        </RouterLink>
      </div>

      {/* 最右侧：语言切换与主题切换 */}
      <div className="pointer-events-auto flex items-center gap-1.5 no-drag">
        <LocaleSwitcher className={switcherClassName} />
        <ThemeSwitcher className={switcherClassName} />
      </div>
    </header>
  )
}
