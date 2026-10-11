import { Sidebar } from '@cloudflare/kumo'
import { Outlet } from '@tanstack/react-router'
import { motion } from 'motion/react'
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
 * 普通 Web（浏览器）环境下的全屏 AI 对话页布局：
 *
 * 1. 外层画一圈画布留白（`p-2 bg-kumo-canvas`），承托内部卡片；
 * 2. 内部由 `Sidebar.Provider` 承担圆角面板外观（`rounded-xl border border-kumo-line`）；
 * 3. 页面进出场通过 `motion.div` 播放 80% 放大 / 缩小淡出的弹性过渡动效；
 * 4. 包含 `SphereTransitionProvider`，在收起时等待退场过渡跑完再导航。
 */
export function WebSphereLayout({ appId }: { appId: string }) {
  const collapseNow = useSphereCollapseNow(appId)

  return (
    <SphereTransitionProvider onExited={collapseNow}>
      <WebSphereLayoutBody appId={appId} />
    </SphereTransitionProvider>
  )
}

function WebSphereLayoutBody({ appId }: { appId: string }) {
  const { isRtl } = useLocale()
  const motionEnabled = useMotionEnabled()
  const { leaving, notifyLeaveComplete } = useSphereTransition()

  return (
    <div className="h-svh bg-kumo-canvas p-0 md:p-2">
      <motion.div
        className="h-full min-h-0"
        initial={motionEnabled ? { opacity: 0, scale: 0.8 } : false}
        animate={leaving ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }}
        transition={
          motionEnabled
            ? leaving
              ? { duration: SPHERE_PANEL_EXIT_MS / 1000, ease: 'easeIn' }
              : { duration: SPHERE_PANEL_ENTER_MS / 1000, ease: 'easeOut' }
            : { duration: 0 }
        }
        onAnimationComplete={notifyLeaveComplete}
      >
        <Sidebar.Provider
          variant="inset"
          key={isRtl ? 'rtl' : 'ltr'}
          side={isRtl ? 'right' : 'left'}
          collapsible="offcanvas"
          resizable
          contained
          defaultWidth={272}
          minWidth={220}
          maxWidth={420}
          className="h-full min-h-0 gap-0 overflow-hidden rounded-none border-0 md:rounded-xl md:border md:border-kumo-line"
        >
          <SphereSidebar appId={appId} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-kumo-base">
            <SphereHeader appId={appId} />
            <Outlet />
          </main>
        </Sidebar.Provider>
      </motion.div>
    </div>
  )
}
