import { ShellContentColumn } from './content-column'
import { ShellSidebarProvider } from './shell-sidebar-provider'
import type { ShellLayoutProps } from './types'

/**
 * 浏览器形态的外壳：**一行 flex** —— 侧边栏 │ 内容列（顶栏 + main）│ AI 面板。
 *
 * 没有窗口条，所以 `ShellSidebarProvider` 的外层退化成 `display: contents`，不产生盒子，
 * 这一行就是 `Sidebar.Provider` 自身。
 */
export function BrowserShellLayout({
  sidebar,
  header,
  mainClassName,
  ai,
  children,
}: ShellLayoutProps) {
  return (
    <ShellSidebarProvider>
      {sidebar}
      <ShellContentColumn header={header} mainClassName={mainClassName} desktop={false}>
        {children}
      </ShellContentColumn>
      {ai}
    </ShellSidebarProvider>
  )
}
