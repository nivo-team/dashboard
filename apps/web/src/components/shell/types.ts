import type { ReactNode } from 'react'

/**
 * 外壳布局的插槽契约 —— **只管摆位置，不管业务**。
 *
 * `ShellLayout` 按 `isDesktop()` 选一个变体渲染：
 * - 浏览器 → `#/components/shell/browser-shell-layout`（顶栏在内容列里）；
 * - 桌面壳 → `#/desktop/shell-layout`（窗口条整行在上，顶栏不渲染）。
 *
 * 两个变体只决定「chrome 放哪、谁渲染」，各列的内容一律由外壳（`AppShell` / `MainLayout`）
 * 通过下面这些插槽传入 —— 布局组件不认识 router、store、权限或 AI 状态。
 */
export interface ShellLayoutProps {
  /** 侧边栏：Kumo `Sidebar` 的整棵子树（业务壳 / 设置壳各给一份）。排在行的最前 */
  sidebar: ReactNode
  /**
   * 浏览器形态的顶栏（`AppHeader` / `MainHeader`）。
   * 桌面壳里**不渲染** —— 窗口条（`topBar`）是同一份 chrome 的另一种形态。
   */
  header?: ReactNode
  /**
   * 桌面壳的窗口条（`#/desktop/title-bar`）。浏览器里忽略。
   * 它只覆盖**工作区**（全高侧边栏右侧），排在内容列 / AI 面板之上。
   */
  topBar?: ReactNode
  /** `<main data-shell-content>` 的额外类（例如 `_main` 的 padding 与页面宽度约束） */
  mainClassName?: string
  /**
   * 外壳级 AI 面板列（可选）：与 `sidebar` 同为这一行的整屏高列，排在内容列之后。
   * 不传就不渲染这一列（`_main` 通用外壳没有 AI）。
   */
  ai?: ReactNode
  /** `<main>` 内部内容（`DetailPreviewProvider` / `<Outlet />` 等） */
  children: ReactNode
}
