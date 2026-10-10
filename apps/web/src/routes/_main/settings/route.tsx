import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 设置模块根（/_main/settings/route.tsx）
 *
 * 这里刻意不渲染额外 UI：模块专属的二级侧边栏由 `_main` 外壳按路由前缀切换
 * （见 `#/components/shell/main-layout.tsx` 的 `SettingsSidebar`）—— 嵌套路由只能替换内容区，
 * 无法接管外层侧边栏，所以「进入设置就换成专属导航」必须由外壳感知路由来做。
 *
 * 保留这个文件是为了遵守「业务模块必须以目录承载、`route.tsx` 是模块边界」的约定：
 * 将来要加模块级守卫、数据预取或布局扩展时挂在这里。
 */
export const Route = createFileRoute('/_main/settings')({
  component: SettingsModuleRoot,
})

function SettingsModuleRoot() {
  return <Outlet />
}
