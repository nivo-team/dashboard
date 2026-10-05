import type { ReactNode } from 'react'
import { AuthHeader } from './auth-header'

export interface AuthLayoutProps {
  /** 页面主体内容（若不传则可供外部插槽使用） */
  children?: ReactNode
  /** 是否显示 Header 下边框 */
  headerBordered?: boolean
  /** 外部额外容器样式 */
  className?: string
}

/**
 * 通用认证外壳布局组件
 *
 * 组织顶部独立 AuthHeader 与正文容器，适用于登录、注册、找回密码等所有认证流页面。
 */
export function AuthLayout({
  children,
  headerBordered = true,
  className = '',
}: AuthLayoutProps) {
  return (
    <div className={`relative flex min-h-screen w-full flex-col bg-kumo-base text-kumo-default ${className}`}>
      {/* 独立认证顶栏：左侧 Logo + 品牌，右侧多语言 + 主题 */}
      <AuthHeader bordered={headerBordered} />

      {/* 认证主体内容挂载区 */}
      <main className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  )
}
