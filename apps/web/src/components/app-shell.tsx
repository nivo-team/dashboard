import { Sidebar } from '@cloudflare/kumo'
import { Outlet, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AiActivityGlow } from '#/components/ai-activity-glow'
import { AiPanel } from '#/components/ai-panel'
import { AppHeader } from '#/components/app-header'
import { AppSidebar } from '#/components/app-sidebar'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { registerAiShellBridge } from '#/lib/ai'
import {
  persistSidebarOpen,
  persistSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SHELL_MOBILE_BREAKPOINT,
  usePreferencesStore,
  useShellUiStore,
} from '#/lib/store'
import { useLocale } from '#/lib/use-locale'

/**
 * 管理后台外壳：左侧导航 + 顶栏 + 内容区。
 *
 * 它整体定义在 `_app.tsx`（layout route）上，子路由切换时不会重新挂载，
 * 因此侧边栏折叠/展开状态、拖拽宽度、滚动位置都能保持。
 *
 * 大屏下使用常规侧边栏（defaultOpen，可折叠/拖拽宽度），
 * 小屏（< 768px）自动切换为全屏抽屉适配手机端。
 */
export function AppShell() {
  const { isRtl } = useLocale()
  const [paletteOpen, setPaletteOpen] = useState(false)
  /**
   * AI 面板的展开状态：由顶栏「Ask AI」按钮**切换**（`onToggleAskAi`，按钮同时拿到
   * `isAskAiOpen` 画 `aria-expanded` 与激活态）。
   *
   * **刻意不持久化**（与详情预览浮层一致）：它是「临时看一眼」的浮层，刷新后自动收起
   * 比记住上次展开更符合预期；需要跨会话保留的是它的**宽度**（`admin.shell-ui.aiPanelWidth`）。
   */
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  /*
    关掉 AI 功能后把**已经打开**的面板收起来：否则它会留在屏幕上，而顶栏的关闭/开关
    按钮已经消失了 —— 用户既关不掉也不知道它为什么还在。这是个很容易漏的状态残留。
  */
  useEffect(() => {
    if (!aiEnabled) setAiPanelOpen(false)
  }, [aiEnabled])

  const navigate = useNavigate()
  const router = useRouter()

  /**
   * 把「只有 React 侧才拿得到」的两件事交给 AI 工具层（见 `#/lib/ai/page-context` 的外壳桥）：
   * `router` 实例由 `main.tsx` 现场创建、没有全局单例，而工具不是 React 组件、
   * 用不了 `useNavigate()`。注册后，`navigate_to` 才能做客户端跳转、
   * `get_page_context` 才能报出路由模板。
   *
   * 路径是运行时字符串（模型给的），这里只能断言绕过 TanStack 的路径联合类型 ——
   * 合法性由工具层的白名单（`isAllowedPath`）保证，不是在类型层。
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
  // 侧边栏 UI 偏好只取一次快照作为初始值：Provider 是非受控的（展开态与宽度由它自己管理），
  // 之后的变化通过 onOpenChange / onWidthChange 写回 store。
  const [{ sidebarOpen, sidebarWidth }] = useState(() => {
    const { sidebarOpen: open, sidebarWidth: width } = useShellUiStore.getState()
    return { sidebarOpen: open, sidebarWidth: width }
  })

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
      <Sidebar.Provider
        side={isRtl ? 'right' : 'left'}
        collapsible="icon"
        // 展开态与宽度取上次会话的值（移动端不记录，见 #/lib/store/shell-ui-store）
        defaultOpen={sidebarOpen}
        onOpenChange={persistSidebarOpen}
        mobileBreakpoint={SHELL_MOBILE_BREAKPOINT}
        // 折叠后悬停/聚焦临时展开，方便在收起状态下快速切换页面。
        peekable
        // 允许拖拽右侧边缘调整宽度（见 AppSidebar 内的 Sidebar.ResizeHandle）。
        resizable
        defaultWidth={sidebarWidth}
        onWidthChange={persistSidebarWidth}
        minWidth={SIDEBAR_MIN_WIDTH}
        maxWidth={SIDEBAR_MAX_WIDTH}
      >
        <AppSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col bg-kumo-canvas">
          <AppHeader
            onOpenCommandPalette={() => setPaletteOpen(true)}
            // 开关：点一次开、再点一次关（按钮的 aria-expanded 与激活态跟着这个状态走）
            onToggleAskAi={() => setAiPanelOpen((open) => !open)}
            isAskAiOpen={aiPanelOpen}
          />
          {/*
            注意：这里的 <main> **不再自带 padding 与 max-w**，它只是内容区的纯容器。
            原因：详情预览的分屏面板要贴住视口边缘（右侧 / 底部）并占满可用高度，
            如果 padding 还留在 main 上，面板会连同 padding 一起被推进来、永远贴不到边。
            现在由 DetailPreviewProvider 内部把这份 padding 分别发给两列 ——
            主列用它（与改动前逐像素一致），分屏面板列用自己的一套（见 detail-preview.tsx）。
            `_main` 外壳的 <main> 没有分屏，保持原样不动。
          */}
          <main
            data-shell-content
            className="flex min-w-0 flex-1 flex-col"
          >
            {/*
              DetailPreviewProvider 同时是「详情预览」的状态源与**布局容器**：
              它把路由内容包成 flex 主列，分屏预览面板作为行尾侧的 1/3 列出现在同一行里
              （挤压式分屏），抽屉形态则走 Kumo Dialog 的 portal。
              放在 main 内、Outlet 外层：预览随页面切换自动收掉，也不需要每个列表页各自搭一遍。
            */}
            <DetailPreviewProvider>
              <Outlet />
            </DetailPreviewProvider>
          </main>
        </div>

        {/*
          AI 面板：放在**内容列之后**、`Sidebar.Provider` 之内 —— 于是它与侧边栏同为
          外壳级的整屏高列（一左一右），而不是内容区里的分屏。路由切换只替换上面的
          `<Outlet />`，面板不受影响；页面也无从感知它的存在。
        */}
        <AiPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
      </Sidebar.Provider>

      {/*
        AI 进行中的页面级反馈：视口四周的流动光带（`fixed` 浮层，不参与布局）。
        放在外壳之后、命令面板之前 —— 它是背景性质的反馈，层级低于交互浮层。
      */}
      <AiActivityGlow />

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
