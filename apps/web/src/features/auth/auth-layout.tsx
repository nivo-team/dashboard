import type { ReactNode } from 'react'
import { AuthHeader } from './auth-header'

export interface AuthLayoutProps {
  /** 页面主体内容（若不传则可供外部插槽使用） */
  children?: ReactNode
  /** 外部额外容器样式 */
  className?: string
}

/**
 * 通用认证外壳布局组件
 *
 * 组织顶部无背景 Fixed 悬浮 AuthHeader 与全屏主体内容容器。
 */
export function AuthLayout({ children, className = '' }: AuthLayoutProps) {
  return (
    <div className={`relative min-h-screen w-full bg-kumo-base text-kumo-default ${className}`}>
      {/* 独立认证顶栏：fixed 悬浮在顶部，左侧 Logo + 品牌，右侧多语言 + 主题 */}
      <AuthHeader />

      {/* 认证主体内容挂载区（全屏铺满） */}
      {children}
    </div>
  )
}
