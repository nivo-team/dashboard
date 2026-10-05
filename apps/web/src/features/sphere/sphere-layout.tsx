import { Sidebar } from '@cloudflare/kumo'
import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CommandPaletteDialog } from '#/components/command-palette'
import { registerAiShellBridge, useAiSessionStore } from '#/lib/ai'
import { useLocale } from '#/lib/use-locale'
import { useMotionEnabled } from '#/lib/use-motion'
import { SphereHeader } from './sphere-header'
import { SphereSidebar } from './sphere-sidebar'
import {
  SPHERE_PANEL_ENTER_MS,
  SPHERE_PANEL_EXIT_MS,
  SphereTransitionProvider,
  useSphereTransition,
} from './sphere-transition'
import { useSphereCollapseNow } from './use-sphere-collapse'

/**
 * 全屏 AI 对话页的布局（`/$appId/sphere`）。
 *
 * 路由文件（`routes/$appId_.sphere/route.tsx`）只做薄适配：守卫 + 把 `appId` 以 props
 * 传进来；布局本体在这里。
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
 * ## 进出场动画
 *
 * 动效容器夹在 `p-2` 那层与 `Sidebar.Provider` **之间**：canvas 底色与内边距不动，
 * 缩放的只有那块圆角面板 —— 于是入场读起来是「面板从画布中央顶出来」，
 * 而不是整页连背景一起放大。
 *
 * - **入场**：`scale 0.8 → 1` + `opacity 0 → 1`，普通缓动（**没有回弹**，与退场同一种手感）；
 * - **出场**（点收起）：`scale → 0.9` + 淡出，跑完才导航（编排见
 *   `sphere-transition.tsx`）。幅度比入场小一点：退场要读成「收回去」，
 *   把入场原样倒放会显得拖沓。
 *
 * `motionEnabled` 为假时不播（`#/lib/use-motion` 的判定：设置 → 外观 → 「界面动效」关掉，
 * 或系统要求减少动效）：`initial={false}` 直接落到位，收起按钮也立即导航
 * （状态正确性不依赖动画）。
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
 * - 外壳桥：AI 工具的 `navigate_to` 需要 `navigate` / 路由模板，重新注册一次
 *   （本页与 AppShell 互斥挂载，单槽注册不会互相覆盖）。
 */
export function SphereLayout({ appId }: { appId: string }) {
  // 收起后的落点（立即导航）；过渡动画跑完才由 Provider 调它
  const collapseNow = useSphereCollapseNow(appId)

  return (
    <SphereTransitionProvider onExited={collapseNow}>
      <SphereLayoutBody appId={appId} />
    </SphereTransitionProvider>
  )
}

/** 动效容器 `useSphereTransition()` 的读取点 —— 必须在 Provider 内部 */
function SphereLayoutBody({ appId }: { appId: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { isRtl } = useLocale()
  const loadHistory = useAiSessionStore((state) => state.loadHistory)
  const [paletteOpen, setPaletteOpen] = useState(false)
  /**
   * 现在能不能播动画（设置 → 外观 → 「界面动效」且系统没要求减少动效，
   * 判定在 `#/lib/use-motion`）。关掉时面板直接出现、收起直接切走，不留过渡。
   */
  const motionEnabled = useMotionEnabled()
  /** 面板此刻是不是正在播收起过渡（真值在 Provider 里，见 sphere-transition.tsx） */
  const { leaving, notifyLeaveComplete, cancelCollapse } = useSphereTransition()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  /*
    收起动画期间用户又切到了别的会话（侧边栏 / 命令面板 / AI 工具导航）：那一次收起作废。
    路由一换说明人已经去别处了，兜底计时不该再把他送回「最大化」前的那一页。
    首次渲染也会跑一次 —— 此时不在收起中，`cancelCollapse` 是空操作。
  */
  useEffect(() => {
    cancelCollapse()
  }, [pathname, cancelCollapse])

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
        {/*
          动效容器：进出场只动 `opacity` / `scale`（合成层动画，不触发布局），
          内部尺寸与布局一概不变 —— 缩放期间会话区不会重新换行。

          两边都是普通的时长 + 缓动（**不回弹**）：入场 `easeOut`（到位的瞬间收住）、
          退场 `easeIn`（加速离开），读起来是同一套手感的正反面。
          `motionEnabled` 为假（关掉「界面动效」或系统要求减少动效）时 initial 直接落到位、
          时长归零 —— 状态照旧，只是没有过渡。
        */}
        <motion.div
          className="h-full min-h-0"
          // `false` = 挂载瞬间直接落到终态，入场动画整段跳过
          initial={motionEnabled ? { opacity: 0, scale: 0.8 } : false}
          animate={leaving ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }}
          transition={
            motionEnabled
              ? leaving
                ? { duration: SPHERE_PANEL_EXIT_MS / 1000, ease: 'easeIn' }
                : { duration: SPHERE_PANEL_ENTER_MS / 1000, ease: 'easeOut' }
              : { duration: 0 }
          }
          // 入场动画跑完时 `leaving` 还是 false，Provider 里会忽略这一次
          onAnimationComplete={notifyLeaveComplete}
        >
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
            key={isRtl ? 'rtl' : 'ltr'}
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
        </motion.div>
      </div>

      <CommandPaletteDialog open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
