import { isDesktop } from '#/desktop/bridge'
import { DesktopShellLayout } from '#/desktop/shell-layout'
import { BrowserShellLayout } from './browser-shell-layout'
import type { ShellLayoutProps } from './types'

/**
 * 外壳布局的**唯一入口**：按运行环境选变体，只管把插槽摆对位置。
 *
 * 它不认识 router、store、权限或 AI 状态 —— 侧边栏 / 顶栏 / main / AI 面板都是外面传进来的
 * 插槽（`ShellLayoutProps` 见 `./types`）。两个具体外壳（`AppShell` / `MainLayout`）
 * 只负责准备这些插槽；形态差异都在变体里：
 * - 浏览器 → `#/components/shell/browser-shell-layout`
 * - 桌面壳 → `#/desktop/shell-layout`
 */
export function ShellLayout(props: ShellLayoutProps) {
  return isDesktop() ? <DesktopShellLayout {...props} /> : <BrowserShellLayout {...props} />
}
