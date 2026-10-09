import { Outlet, useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AiActivityGlow } from '#/features/ai/components/activity-glow'
import { AiPanel } from '#/features/ai/components/panel'
import { AppHeader } from '#/components/app-header'
import { AppSidebar } from '#/components/app-sidebar'
import { CommandPaletteDialog } from '#/components/command-palette'
import { DesktopTitleBar } from '#/components/desktop-title-bar'
import { DetailPreviewProvider } from '#/components/detail-preview'
import { HeaderActions } from '#/components/header-actions'
import { ShellSidebarProvider } from '#/components/shell-sidebar-provider'
import { isDesktop } from '#/lib/desktop-bridge'
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
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'

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
  const [paletteOpen, setPaletteOpen] = useState(false)
  /**
   * AI 面板的展开状态：由顶栏「Ask AI」按钮**切换**（`onToggleAskAi`，按钮同时拿到
   * `isAskAiOpen` 只用来画 `aria-expanded`，**没有视觉激活态** —— 面板已经占着屏幕了，
   * 按钮再亮一块浅底只是多一处动静）。
   *
   * 状态存在 **sessionStorage**（`#/features/ai/core/panel-session`）：面板头行的「最大化」会跳到
   * `/$appId/sphere`，`AppShell` 整体卸载 —— 只放组件 state 的话，返回原页面时面板会被
   * 重置成收起。放会话级存储后「收起全屏 → 面板还是展开的」。只跨路由、不跨浏览器会话
   * （新标签页从收起开始），所以不用偏好 store 也用不着 localStorage。
   */
  const [aiPanelOpen, setAiPanelOpen] = useState(readAiPanelOpen)
  /**
   * 本次外壳挂载是不是**从最大化返回**（见 `#/features/ai/core/panel-session`）。
   *
   * 那种情况下面板**一直开着**（`aiPanelOpen` 从 sessionStorage 读回 `true`），只是宿主
   * `AppShell` 在 `/sphere` 期间被卸载过 —— 重新挂载时不该再演一遍「打开」：
   * Float 会从底部再升起一次、Split 会从 0 宽再滑入一次，读起来像面板被莫名关掉又打开。
   *
   * 惰性初始化 = 挂载时读一次（纯读，副作用由下面的 effect 显式清）；effect 在**首帧之后**
   * 把它作废，于是用户之后自己关掉再打开面板时，入场动画照常（那是真正的一次「打开」）。
   */
  const [skipPanelEnter, setSkipPanelEnter] = useState(readAiPanelMaximized)
  /**
   * Float 浮窗是否被折成「只有头行」的窄条。
   *
   * 状态放在外壳而不是 `AiPanel` 内部：顶栏那颗「Ask AI」按钮要按它决定这一下是**展开**
   * 还是**关闭**（见 `handleToggleAskAi`），而按钮在 `AppHeader` 里 —— 真值只能有一份，
   * 就放在两者共同的上层。**不持久化**（折叠是「这一次不想看」，与开关本身不同）。
   */
  const [aiFloatCollapsed, setAiFloatCollapsed] = useState(false)
  /**
   * 权限清单同步挂在**外壳**上，而不是某个子组件（原先挂在 `AppSidebar`）。
   *
   * 原因：`hasPageCapabilityPermission` / 路由守卫 / 命令面板都读同一个权限 store；
   * 只要有一个入口没经过 `AppSidebar`（比如 `/sphere`、`_main` 外壳、直接粘贴深链），
   * 权限就是空的 —— 严格判定下会表现为「这页的能力全没了」。
   * 外壳是所有业务页的公共祖先，放这里一处即可覆盖全部子路由。
   */
  useUserPermissions()

  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)
  const aiPanelMode = usePreferencesStore((state) => state.aiPanelMode)
  /** 「最大化」跳哪个路由要看有没有当前会话（见 `handleMaximizeAi`） */
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  // 移动端浮窗是整屏，折叠不成立（`AiPanel` 里也不发折叠按钮），这里跟着一起排除
  const isMobileViewport = useIsMobileViewport()

  /**
   * 桌面壳：外壳换形。
   *
   * 窗口条（`DesktopTitleBar`）取代顶栏 —— 于是标签条在最左、原本的顶栏行末工具区在最右，
   * 顶栏那一行不再渲染（`AppHeader` 与窗口条是同一份 chrome 的两种形态，不是两行）。
   * 窗口条由 `ShellSidebarProvider` 排到侧边栏与内容列那一行**之上**，横跨整个窗口。
   *
   * 唯一的例外是窗口被拖到比 `md` 还窄：那时侧边栏会变成抽屉，而抽屉的汉堡按钮在顶栏里
   * （窗口条在 `Sidebar.Provider` 之外，拿不到它的 context，放不了 `Sidebar.Trigger`）——
   * 所以这种「桌面壳 + 移动视口」的组合下把顶栏也渲染回来，工具区则只留在顶栏一份，
   * 避免同一排按钮出现两次。桌面壳的窗口最小宽度（900）正常情况下走不到这里。
   */
  const desktopChrome = isDesktop()
  const showHeader = !desktopChrome || isMobileViewport

  /**
   * 顶栏「Ask AI」按钮。
   *
   * - **面板关着**：打开（总是完整面板 —— 折叠只是「这一次不想看」，不跨开合保留）；
   * - **面板开着且折叠**：这一下是**展开**，不是关闭 —— 用户点这颗按钮想看的就是对话，
   *   若在这里把窄条关掉，他得再点一次才能看到内容；
   * - **面板开着且展开**：关闭（原来的开关语义）。
   *
   * Split 形态没有折叠态（`collapsed` 只作用于 Float），因此按 `aiPanelMode` 分流。
   */
  const handleToggleAskAi = () => {
    if (!aiPanelOpen) {
      setAiPanelOpen(true)
      setAiFloatCollapsed(false)
      return
    }

    if (aiPanelMode === 'float' && aiFloatCollapsed && !isMobileViewport) {
      setAiFloatCollapsed(false)
      return
    }

    setAiPanelOpen(false)
  }

  /*
    关掉 AI 功能后把**已经打开**的面板收起来：否则它会留在屏幕上，而顶栏的关闭/开关
    按钮已经消失了 —— 用户既关不掉也不知道它为什么还在。这是个很容易漏的状态残留。
  */
  useEffect(() => {
    if (!aiEnabled) setAiPanelOpen(false)
  }, [aiEnabled])

  /* 开合状态每次变化都写回 sessionStorage：跳 `/sphere` 再回来（外壳重新挂载）时读它 */
  useEffect(() => {
    persistAiPanelOpen(aiPanelOpen)
  }, [aiPanelOpen])

  /*
    跳过入场只覆盖「返回后的首帧」：`AiPanel` 在那一次渲染里已经把它读成快照
    （Float 记进属性、Split 记进初始宽度），之后就得把 prop 放回 false —— 否则用户
    之后自己关掉再打开面板时，那一次**真正**的「打开」也会不播动画。
    用 `requestAnimationFrame` 而不是 `setTimeout(0)`：要的正是「首帧渲染之后」这一刻。
    同一刻把会话级标记也清掉：这次「从最大化返回」已经消费完了。
  */
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
  /*
    URL 里的 appId：正常业务外壳下与 `currentApp` 由守卫同步成同一个值，
    但「跳到全屏对话页」拼的是 URL，直接读参数比读 store 更贴近目标。
  */
  const { appId } = useParams({ from: '/$appId' })

  /**
   * AI 面板头行「最大化」：换成**全屏 AI 对话页**。
   *
   * 目标是哪个路由**取决于面板里现在有没有会话**：
   * - 有（`activeSessionId` 非空）→ `/$appId/sphere/chat/$chatId`，当前这段对话原样续上
   *   （AI 会话状态是模块级 store，与路由无关）；
   * - 没有 → `/$appId/sphere`，全屏页按「新会话」打开。
   *
   * 走之前先把**当前 href 记进 sessionStorage**（含查询串）：`/sphere` 的「收起」要回到
   * 这一页，而不是笼统的应用首页 —— 用户可能是在带筛选条件的列表页上最大化的。
   *
   * 面板自身不参与跳转 —— 它只把点击交回外壳（见 `AiPanelProps.onMaximize`）。
   */
  const handleMaximizeAi = () => {
    rememberMaximizeOrigin(router.state.location.href)
    // 面板是被「带走」的，不是被关掉的：回来时据此跳过它重播的入场动画
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

  /**
   * 把「只有 React 侧才拿得到」的两件事交给 AI 工具层（见 `#/features/ai/core/page-context` 的外壳桥）：
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

  /**
   * 窗口条行末的工具区（`Ask AI` / `支持` / 账号菜单）。
   *
   * `AppHeader` 内部本来就会渲染一份同样的工具区；桌面壳里整行顶栏被窗口条取代，
   * 所以这里再构造一份交给窗口条。两者**不会同时在屏幕上** —— 谁出现由上面的
   * `showHeader` 决定，因此也不存在两套 props 各自漂移的问题。
   */
  const headerActions = (
    <HeaderActions
      showAskAi={aiEnabled}
      onAskAi={handleToggleAskAi}
      askAiExpanded={aiPanelOpen}
      onOpenCommandPalette={() => setPaletteOpen(true)}
    />
  )

  return (
    <>
      {/*
        侧边栏 Provider 的接线（含移动端抽屉开合）在 `ShellSidebarProvider` 里统一处理，
        两个外壳共用一份，避免「桌面非受控 / 移动端受控」这套接法各写一遍而漂移。
        `topBar` 只在桌面壳里给：窗口条要横跨整个窗口，必须排在下面那一行之上。
      */}
      <ShellSidebarProvider
        topBar={
          desktopChrome ? (
            <DesktopTitleBar
              // 标签页全部关掉之后回应用首页（首页会随之重新开出一个标签）
              homeTo={`/${appId}/home`}
              // 工具区只挂一处：桌面壳里它在窗口条行末，退化出顶栏时（见 showHeader）留给顶栏
              actions={showHeader ? undefined : headerActions}
            />
          ) : null
        }
      >
        <AppSidebar onOpenCommandPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col bg-kumo-canvas">
          {showHeader ? (
            <AppHeader
              onOpenCommandPalette={() => setPaletteOpen(true)}
              // 见 `handleToggleAskAi`：折叠态下这一下是展开，展开态下才是关闭
              onToggleAskAi={handleToggleAskAi}
              isAskAiOpen={aiPanelOpen}
            />
          ) : null}
          {/*
            注意：这里的 <main> **不再自带 padding 与 max-w**，它只是内容区的纯容器。
            原因：详情预览的分屏面板要贴住视口边缘（右侧 / 底部）并占满可用高度，
            如果 padding 还留在 main 上，面板会连同 padding 一起被推进来、永远贴不到边。
            现在由 DetailPreviewProvider 内部把这份 padding 分别发给两列 ——
            主列用它（与改动前逐像素一致），分屏面板列用自己的一套（见 detail-preview.tsx）。
            `_main` 外壳的 <main> 没有分屏，保持原样不动。
          */}
          <main data-shell-content className="flex min-w-0 flex-1 flex-col">
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
        <AiPanel
          open={aiPanelOpen}
          onClose={() => setAiPanelOpen(false)}
          // 从最大化返回：面板一直开着，跳过它这一次的入场（见 `skipPanelEnter`）
          skipEnterAnimation={skipPanelEnter}
          // 折叠态的真值在外壳（`handleToggleAskAi` 也要读它），面板只是受控显示
          collapsed={aiFloatCollapsed}
          onToggleCollapsed={() => setAiFloatCollapsed((collapsed) => !collapsed)}
          // 头行「最大化」→ 全屏 AI 对话页
          onMaximize={handleMaximizeAi}
        />
      </ShellSidebarProvider>

      {/*
        AI 进行中的页面级反馈：视口四周的流动光带（`fixed` 浮层，不参与布局）。
        放在外壳之后、命令面板之前 —— 它是背景性质的反馈，层级低于交互浮层。
      */}
      <AiActivityGlow />

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
