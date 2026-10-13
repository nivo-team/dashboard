import { Outlet, useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AiActivityGlow } from '#/features/ai/components/activity-glow'
import { AiPanel } from '#/features/ai/components/panel'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { PageTabStrip } from '#/components/page-tab-strip'
import { usePageTabsEnabled } from '#/lib/page-tabs'
import {
  clearAiPanelMaximized,
  markAiPanelMaximized,
  persistAiPanelOpen,
  readAiPanelMaximized,
  readAiPanelOpen,
  registerAiShellBridge,
  rememberMaximizeOrigin,
  useAiSessionStore,
} from '#/features/ai/core'
import { useUserPermissions } from '#/lib/permissions'
import { usePreferencesStore } from '#/lib/store'
import { LayoutSidebarProvider } from '../provider'
import { ShellContentColumn } from '../common/content-column'
import { AppSidebar } from '#/components/app-sidebar'
import { MobileAppHeader } from './header'

/**
 * 移动端专属业务外壳布局（Mobile AppLayout）：
 * 专为移动设备浏览器与移动端原生壳（如 Android APK）打造：
 * - 沉浸式顶部状态栏与汉堡按钮；
 * - 抽屉式全屏侧边栏；
 * - 移动端全屏 AI 面板。
 */
export function MobileAppLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(readAiPanelOpen)
  const [skipPanelEnter, setSkipPanelEnter] = useState(readAiPanelMaximized)

  useUserPermissions()

  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const pageTabsEnabled = usePageTabsEnabled()

  const handleToggleAskAi = () => {
    setAiPanelOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!aiEnabled) setAiPanelOpen(false)
  }, [aiEnabled])

  useEffect(() => {
    persistAiPanelOpen(aiPanelOpen)
  }, [aiPanelOpen])

  useEffect(() => {
    if (!skipPanelEnter) return
    const frame = requestAnimationFrame(() => {
      setSkipPanelEnter(false)
      clearAiPanelMaximized()
    })
    return () => cancelAnimationFrame(frame)
  }, [skipPanelEnter])

  const navigate = useNavigate()
  const router = useRouter()
  const { appId } = useParams({ from: '/$appId' })

  const handleMaximizeAi = () => {
    rememberMaximizeOrigin(router.state.location.href)
    markAiPanelMaximized()

    if (activeSessionId) {
      void navigate({
        to: '/$appId/sphere/chat/$chatId',
        params: { appId, chatId: activeSessionId },
      })
      return
    }
    void navigate({ to: '/$appId/sphere', params: { appId } })
  }

  useEffect(() => {
    registerAiShellBridge({
      navigate: (to) => {
        void navigate({ to: to as never })
      },
      getRoutePath: () => router.state.matches.at(-1)?.routeId ?? null,
    })
    return () => registerAiShellBridge(null)
  }, [navigate, router])

  // ⌘K / Ctrl+K 打开命令面板
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

  const headerLeading = pageTabsEnabled ? (
    <PageTabStrip homeTo={`/${appId}/home`} onOpenCommandPalette={() => setPaletteOpen(true)} />
  ) : undefined

  return (
    <LayoutSidebarProvider>
      <AppSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />

      <ShellContentColumn
        desktop={false}
        header={
          <MobileAppHeader
            leading={headerLeading}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            onToggleAskAi={handleToggleAskAi}
            isAskAiOpen={aiPanelOpen}
          />
        }
      >
        <DetailPreviewProvider>
          <Outlet />
        </DetailPreviewProvider>
      </ShellContentColumn>

      {aiEnabled ? (
        <>
          <AiActivityGlow />
          <AiPanel
            open={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
            onMaximize={handleMaximizeAi}
            collapsed={false}
            skipEnterAnimation={skipPanelEnter}
          />
        </>
      ) : null}

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </LayoutSidebarProvider>
  )
}
