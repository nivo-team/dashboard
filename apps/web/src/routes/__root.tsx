import { LinkProvider, Toasty } from '@cloudflare/kumo'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { AppLink } from '#/components/app-link'
import { AppRootLayout } from '#/components/app-root-layout'
import { NotFoundFullScreen } from '#/components/not-found'
import { appToastManager } from '#/lib/toast'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundFullScreen,
})

function RootComponent() {
  return (
    // LinkProvider 让所有 Kumo 链接组件（Link / LinkButton / Sidebar.MenuButton /
    // Breadcrumbs.Link）都走 TanStack Router 的客户端跳转。
    // Toasty 提供全局 Toast 弹窗容器与动画视口；传入模块作用域的管理器，
    // 让 React 之外的代码（API 响应拦截器）也能弹同一个队列的提示。
    // AppRootLayout 统一挂应用级 provider（TooltipProvider）并同步 lang / dir（RTL），
    // 页面组件不要再各自包 provider 或操作 document。
    <Toasty toastManager={appToastManager}>
      <LinkProvider component={AppLink}>
        <AppRootLayout>
          <Outlet />
        </AppRootLayout>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      </LinkProvider>
    </Toasty>
  )
}
