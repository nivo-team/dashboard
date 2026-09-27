import { createFileRoute, redirect } from '@tanstack/react-router'
import { MainLayout } from '#/components/main-layout'
import { NotFound } from '#/components/not-found'
import { getAuthSnapshot } from '#/lib/auth'

/**
 * 与应用无关的通用外壳布局路由（/_main/route.tsx）
 *
 * 承载与具体 appId 无关的全局功能（如应用选择、个人中心、系统支持等）：
 * - 严格遵循 Kumo Sidebar 标准（与 main layout 的 AppSidebar / AppShell 保持视觉一致）；
 * - 传参使用标准组件引用（icon={SquaresFourIcon} 与 itemId），折叠后图标正常居中；
 * - 包含可调整宽度的 ResizeHandle 与折叠模式下的 Tooltip；
 * - 侧边栏与头部均完整支持国际化多语言与 RTL 切换。
 */
export const Route = createFileRoute('/_main')({
  beforeLoad: ({ location }) => {
    const auth = getAuthSnapshot()
    if (!auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: MainLayout,
  notFoundComponent: NotFound,
})
