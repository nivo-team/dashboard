import { Sidebar } from '@cloudflare/kumo'
import { createFileRoute, Outlet, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { SphereHeader } from './-components/sphere-header'
import { SphereSidebar } from './-components/sphere-sidebar'
import { registerAiShellBridge, useAiSessionStore } from '#/lib/ai'
import { guardAppRoute } from '#/lib/app-route-guard'
import { useLocale } from '#/lib/use-locale'

/**
 * 全屏 AI 对话页的布局（`/$appId/sphere`）。
 *
 * ## 为什么目录名是 `$appId_.sphere`（带下划线）
 *
 * 业务外壳 `AppShell`（应用侧边栏 + 顶栏 + AI 面板）挂在 `routes/$appId/route.tsx`
 * 上，`$appId/` 目录下的一切都会继承它。本页要的是一个**全新的、没有应用侧边栏**的
 * 布局，所以刻意用 TanStack Router 的「逃离父布局」约定：把父级段写成 `$appId_`
 * （段尾下划线），路由就变成根布局的子路由，URL 仍是 `/$appId/sphere`。
 *
 * 代价是它**拿不到 `$appId/route.tsx` 的守卫**，因此这里自己调同一份
 * `guardAppRoute`（认证 + appId 校验 + 激活应用同步），不要让两处逻辑各自长出来。
 *
 * ## 布局
 *
 * 最外层 `h-svh bg-kumo-canvas p-2`：整页留一圈内边距；里面是**一块圆角面板**，
 * 侧边栏与 chat 区**都在这一层边框之内**（`rounded-xl border border-kumo-line`，
 * 由 `Sidebar.Provider` 的 wrapper 承担）。Provider 用 `contained` 把侧边栏
 * 收进这块有界容器（不再顶到视口边缘、也不再把 `min-h-svh` 撑出去）。
 *
 * **内外分隔线归侧边栏**：由 `SphereSidebar` 按 `open` 决定画不画（收起后整列滑走、
 * 线也消失），所以 Provider 用 `variant="inset"`（Kumo 不为它加 `border-e`）。
 *
 * 收起按钮有**两个、一次只显示一个**：展开时在侧边栏头行的标题右侧，收起后整列滑走，
 * 改由 chat 头行行首那个显示（见各组件里的 `Tooltip + Sidebar.Trigger`）。
 *
 * ## 会话从哪来
 *
 * 历史列表由本布局**统一加载**（`fresh: true`，只拉列表、不恢复上一次的会话）；
 * 具体用哪一段由子路由决定：
 * - `sphere/`（`index.tsx`）→ 新会话；
 * - `sphere/chat/$chatId`（`chat/$chatId.tsx`）→ 指定会话，找不到渲染 404。
 *
 * ## 与 AppShell 重合的两件事，都刻意对齐
 *
 * - 撤销快捷键：⌘K 命令面板在本页同样可用（挂同一份 `CommandPaletteDialog`）；
 * - 外壳桥：AI 工具的 `navigate_to` 需要 `navigate` / 路由模板，重新注册一次。
 */
export const Route = createFileRoute('/$appId_/sphere')({
  beforeLoad: ({ location, params }) => {
    guardAppRoute({ appId: params.appId, href: location.href })
  },
  component: SphereLayout,
})

function SphereLayout() {
  const navigate = useNavigate()
  const router = useRouter()
  const { isRtl } = useLocale()
  const { appId } = Route.useParams()
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
    两处**不会同时挂载**（本布局与 AppShell 互斥），所以单槽注册不会互相覆盖。
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
      {/*
        整页留一圈内边距，里面是「侧边栏 + chat」共用的那块圆角面板。
        `contained` 是必须的：Provider 默认会给 wrapper 加 `min-h-svh`，
        在这层 padding 里会顶出去；contained 同时把侧边栏收进这个有界容器。
      */}
      <div className="h-svh bg-kumo-canvas p-2">
        <Sidebar.Provider
          /*
            inset：**不画内外分隔线**（Kumo 只给 variant="sidebar" 加 `border-e`）。
            那条分隔线由侧边栏自己按开合状态画（见 sphere-sidebar.tsx 的
            `contentClassName`）：收起后侧边栏整列滑走，线也跟着消失，不会剩一条
            悬空的竖线。

            底色不能靠 wrapper：inset 会把 wrapper 底色设成 recessed，而这里要的是
            一块 base 面板 —— 所以由两个子列各自铺满底色（侧边栏自带 `--sidebar-bg`，
            main 显式 `bg-kumo-base`），wrapper 那层反而看不见。
          */
          variant="inset"
          side={isRtl ? 'right' : 'left'}
          // 收起 = 整列滑走（offcanvas）：会话行没有图标，收成 icon 轨道会只剩空行
          collapsible="offcanvas"
          resizable
          contained
          defaultWidth={272}
          minWidth={220}
          maxWidth={420}
          className="h-full min-h-0 gap-0 overflow-hidden rounded-xl border border-kumo-line"
        >
          <SphereSidebar appId={appId} />
          {/*
            圆角与边框由外层面板承担。头行挂在**布局**上而不是各页面里：会话 404 时
            `notFoundComponent` 会替换掉路由组件，头行若在页面里就一起没了 ——
            用户会被困在一张没有出口的空页上。标题也由头行按路由推导（找不到的那段留空）。
          */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-kumo-base">
            <SphereHeader appId={appId} />
            <Outlet />
          </main>
        </Sidebar.Provider>
      </div>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
