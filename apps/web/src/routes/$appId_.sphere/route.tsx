import { createFileRoute } from '@tanstack/react-router'
import { SphereLayout } from '#/features/ai/sphere/sphere-layout'
import { guardAppRoute } from '#/lib/app-route-guard'

/**
 * 全屏 AI 对话页的**薄路由**（`/$appId/sphere`）—— 布局实现在
 * `#/features/ai/sphere/sphere-layout`。
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
 * 同理，`AppShell` 里给 AI 工具的 `registerAiShellBridge` 也不会跟着过来 ——
 * 那一处重新注册已随布局本体移入 `#/features/ai/sphere/sphere-layout`（两者互斥挂载，
 * 单槽注册不会互相覆盖）。
 */
export const Route = createFileRoute('/$appId_/sphere')({
  beforeLoad: ({ location, params }) => {
    guardAppRoute({ appId: params.appId, href: location.href })
  },
  component: SphereLayoutRoute,
})

/** 只做取参：布局本体在 `#/features/ai/sphere/sphere-layout`。 */
function SphereLayoutRoute() {
  const { appId } = Route.useParams()
  return <SphereLayout appId={appId} />
}
