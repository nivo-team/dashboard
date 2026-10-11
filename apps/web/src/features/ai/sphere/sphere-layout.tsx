import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { registerAiShellBridge, useAiSessionStore } from '#/features/ai/core'
import { isDesktop } from '#/native/bridge'
import { DesktopSphereLayout } from './desktop-sphere-layout'
import { WebSphereLayout } from './web-sphere-layout'

/**
 * 全屏 AI 对话页的布局分发入口（`/$appId/sphere`）。
 *
 * 采用与外壳相同的变体拆分架构（`AppShell` → `BrowserShellLayout` / `DesktopShellLayout`）：
 * 1. **桌面壳（独立子窗口）**：由 `DesktopSphereLayout` 渲染 —— 全屏铺满、无卡片外边距与圆角边框、全透明背景透出系统毛玻璃；
 * 2. **浏览器环境**：由 `WebSphereLayout` 渲染 —— `p-2 bg-kumo-canvas` 画布外边距、圆角边框卡片、带有进入与退出的缩放动效；
 * 3. **公共能力收口在此**：会话列表加载、AI 工具外壳桥注册、全局 ⌘K 命令面板接线。
 */
export function SphereLayout({ appId }: { appId: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const loadHistory = useAiSessionStore((state) => state.loadHistory)
  const [paletteOpen, setPaletteOpen] = useState(false)

  /*
    会话列表：本页只有这一处触发加载。
    `fresh: true` = 拉列表但不恢复「上次打开的会话」—— 用哪一段由路由决定，
    否则 `loadHistory` 的恢复逻辑会和路由的会话选择互相覆盖。
    同一个 app 已经加载过时它内部会早退，所以子路由间来回切不会重复清空。
  */
  useEffect(() => {
    void loadHistory({ fresh: true })
  }, [appId, loadHistory])

  /*
    与 `AppShell` 同一份「外壳桥」：`navigate_to` 等 AI 工具不是 React 组件，
    用不了 `useNavigate()`；`get_page_context` 也需要当前路由模板。
    两处不会同时挂载（本布局与 AppShell 互斥），所以单槽注册不会互相覆盖。
  */
  useEffect(() => {
    registerAiShellBridge({
      navigate: (to) => {
        void navigate({ to: to as never })
      },
      getRoutePath: () => router.state.matches.at(-1)?.routeId ?? null,
    })
    return () => registerAiShellBridge(null)
  }, [navigate, router])

  /* ⌘K / Ctrl+K：与 AppShell 同一套接线，命令面板在本页也能唤起 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {isDesktop() ? <DesktopSphereLayout appId={appId} /> : <WebSphereLayout appId={appId} />}

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
