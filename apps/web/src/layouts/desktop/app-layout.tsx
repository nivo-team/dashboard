import { Outlet, useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AiActivityGlow } from '#/features/ai/components/activity-glow'
import { AiPanel } from '#/features/ai/components/panel'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { HeaderActions } from '#/components/header-actions'
import { isStandaloneWindow, openDesktopWindow } from '#/native/bridge'
import { DesktopStandaloneLayout } from '#/native/standalone-layout'
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
import { DesktopShellLayout } from './shell-layout'
import { DesktopTitleBar } from './title-bar'
import { AppSidebar } from '#/components/app-sidebar'

/**
 * PC 桌面端业务外壳布局（Desktop AppLayout）：
 * - 如果处于独立 Sphere / 极简窗口，自动呈现 DesktopStandaloneLayout；
 * - 正常主窗口呈现：全高毛玻璃透明侧边栏 + 整宽 fixed 浮层原生窗口条 + 工作区；
 * - 支持桌面专属多窗口（openDesktopWindow）与全功能 AI 面板。
 */
export function DesktopAppLayout() {
  if (isStandaloneWindow()) {
    return <DesktopStandaloneLayout />
  }

  return <DesktopAppLayoutStandard />
}

function DesktopAppLayoutStandard() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(readAiPanelOpen)
  const [skipPanelEnter, setSkipPanelEnter] = useState(readAiPanelMaximized)
  const [aiFloatCollapsed, setAiFloatCollapsed] = useState(false)

  useUserPermissions()

  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)
  const aiPanelMode = usePreferencesStore((state) => state.aiPanelMode)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)

  const handleToggleAskAi = () => {
    if (!aiPanelOpen) {
      setAiPanelOpen(true)
      setAiFloatCollapsed(false)
      return
    }

    if (aiPanelMode === 'float' && aiFloatCollapsed) {
      setAiFloatCollapsed(false)
      return
    }

    setAiPanelOpen(false)
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

  const handleOpenNewWindow = () => {
    const targetPath = activeSessionId
      ? `/${appId}/sphere/chat/${activeSessionId}`
      : `/${appId}/sphere`
    void openDesktopWindow({ path: targetPath, name: 'sphere', title: 'Sphere' })
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

  const desktopHeaderActions = (
    <HeaderActions
      size="sm"
      showAskAi={aiEnabled}
      onAskAi={handleToggleAskAi}
      askAiExpanded={aiPanelOpen}
      onOpenCommandPalette={() => setPaletteOpen(true)}
    />
  )

  return (
    <>
      <DesktopShellLayout
        sidebar={<AppSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />}
        topBar={
          <DesktopTitleBar
            homeTo={`/${appId}/home`}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            actions={desktopHeaderActions}
          />
        }
        ai={
          aiEnabled ? (
            <>
              <AiActivityGlow />
              <AiPanel
                open={aiPanelOpen}
                onClose={() => setAiPanelOpen(false)}
                onMaximize={handleMaximizeAi}
                onOpenNewWindow={handleOpenNewWindow}
                collapsed={aiFloatCollapsed}
                onToggleCollapsed={() => setAiFloatCollapsed((c) => !c)}
                skipEnterAnimation={skipPanelEnter}
              />
            </>
          ) : null
        }
      >
        <DetailPreviewProvider>
          <Outlet />
        </DetailPreviewProvider>
      </DesktopShellLayout>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
