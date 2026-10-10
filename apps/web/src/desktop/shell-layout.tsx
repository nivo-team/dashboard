import { ShellContentColumn } from '#/components/shell/content-column'
import { ShellSidebarProvider } from '#/components/shell/shell-sidebar-provider'
import type { ShellLayoutProps } from '#/components/shell/types'

/**
 * 桌面壳形态的外壳：**全高侧边栏 + 工作区**，窗口条是**整宽浮层**。
 *
 * 结构是一行（`ShellSidebarProvider`）：左侧侧边栏占满整窗高（`100svh`）、背景透明；
 * 右侧是工作区（内容列 │ AI 面板）。窗口条（`topBar`）是 `fixed` 的整宽浮层，盖在最顶端 ——
 * 它的**左上控制组属于窗口条、只是靠在窗口最左侧**，浮在透明侧边栏之上，所以侧边栏收起时
 * 控件不动、不必切换组件（见 `#/desktop/title-bar`）。
 *
 * 工作区因此自己留出窗口条的高度（`pt-[--shell-chrome-h]`），侧边栏的内容则下移同样的高度
 * （见 styles.css），那一条顶端留给浮层。
 *
 * 与浏览器形态（`#/components/shell/browser-shell-layout`）的区别都在这层收口：
 * 1. 窗口条只在这里出现，浏览器那套不认识它；
 * 2. 顶栏（`header`）不渲染 —— 窗口条是同一份 chrome 的另一种形态。
 */
export function DesktopShellLayout({
  sidebar,
  topBar,
  mainClassName,
  ai,
  children,
}: ShellLayoutProps) {
  return (
    <ShellSidebarProvider>
      {sidebar}

      {/* 工作区：顶部留出窗口条的高度（窗口条是 fixed 浮层，不占文档流） */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[var(--shell-chrome-h)]">
        {/*
          main 与 AI 面板共用的容器：再嵌一层 `p-1`，两者一起内缩，
          于是内容看起来「嵌在程序里」（内缩量与 `--shell-content-inset` 一致）。
        */}
        <div className="flex min-h-0 min-w-0 flex-1 p-1">
          <ShellContentColumn mainClassName={mainClassName} desktop>
            {children}
          </ShellContentColumn>
          {ai}
        </div>
      </div>

      {topBar}
    </ShellSidebarProvider>
  )
}
