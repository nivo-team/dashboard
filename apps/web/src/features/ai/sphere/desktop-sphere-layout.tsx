import { Sidebar } from '@cloudflare/kumo'
import { Outlet } from '@tanstack/react-router'
import { useLocale } from '#/lib/use-locale'
import { DesktopSphereTitleBar } from './desktop-sphere-title-bar'
import { SphereSidebar } from './sphere-sidebar'

/**
 * 桌面壳（原生独立子窗口）环境下的全屏 AI 对话页布局：
 *
 * 参考主布局（MainLayout / DesktopTitleBar）统一设计：
 * 1. 结构整屏顶格铺满视口（`h-svh w-svw p-0`），无外层内边距；
 * 2. 整体采用全透明背景，原汁原味透出操作系统原生毛玻璃（Vibrancy / Mica）；
 * 3. 挂载整宽固定浮层 `DesktopSphereTitleBar`：
 *    - 侧边栏切换控制按钮始终固定在物理左侧红绿灯旁边，折叠和收起都固定不动；
 *    - 切换按钮后面紧跟 AI Bot 形象与标题；
 *    - Header 无底边 border，整条可顺畅拖拽；
 * 4. 工作区 `<main>` 在顶部让出窗口条高度（`pt-[var(--shell-chrome-h,40px)]`）；
 * 5. 侧边栏展开时保留与工作区之间的竖线，收起时整列平滑滑出。
 */
export function DesktopSphereLayout({ appId }: { appId: string }) {
  const { isRtl } = useLocale()

  return (
    <div
      data-desktop-sphere
      className="flex h-svh w-svw overflow-hidden bg-transparent p-0"
    >
      <Sidebar.Provider
        variant="inset"
        key={isRtl ? 'rtl' : 'ltr'}
        side={isRtl ? 'right' : 'left'}
        collapsible="offcanvas"
        resizable
        contained
        mobileBreakpoint={0}
        defaultWidth={272}
        minWidth={220}
        maxWidth={420}
        className="h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border-0 bg-transparent"
      >
        <SphereSidebar appId={appId} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent pt-[var(--shell-chrome-h,40px)]">
          <Outlet />
        </main>
        <DesktopSphereTitleBar />
      </Sidebar.Provider>
    </div>
  )
}
