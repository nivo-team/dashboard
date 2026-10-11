import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { isDesktop, isSettingsWindow, openSettingsWindow } from '#/native/bridge'

/**
 * 设置模块根（/_main/settings/route.tsx）
 *
 * 桌面壳环境下：所有设置路由均在独立 settings 子窗口（无 Tab、全高模式）中打开。
 * 若主窗口尝试直接进入设置，拦截并唤起独立 settings 窗口，避免打断主窗口业务工作流。
 */
export const Route = createFileRoute('/_main/settings')({
  beforeLoad: ({ location }) => {
    if (isDesktop() && !isSettingsWindow()) {
      void openSettingsWindow(location.href)
      throw redirect({ to: '/' })
    }
  },
  component: SettingsModuleRoot,
})

function SettingsModuleRoot() {
  return <Outlet />
}
