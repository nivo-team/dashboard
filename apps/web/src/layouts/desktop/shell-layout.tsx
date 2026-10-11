import type { ReactNode } from 'react'
import { LayoutSidebarProvider } from '../provider'
import { ShellContentColumn } from '../common/content-column'

export interface DesktopShellLayoutProps {
  sidebar?: ReactNode
  topBar?: ReactNode
  mainClassName?: string
  ai?: ReactNode
  children?: ReactNode
}

/**
 * 桌面原生形态的外壳骨架：**全高侧边栏 + 工作区**，窗口条是**整宽浮层**。
 *
 * 左侧侧边栏占满整窗高（100svh）、背景透明；
 * 右侧是工作区（内容列 │ AI 面板）。窗口条（topBar）是 fixed 的整宽浮层，盖在最顶端。
 */
export function DesktopShellLayout({
  sidebar,
  topBar,
  mainClassName,
  ai,
  children,
}: DesktopShellLayoutProps) {
  return (
    <LayoutSidebarProvider>
      {sidebar}

      {/* 工作区：顶部留出窗口条的高度（窗口条是 fixed 浮层，不占文档流） */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[var(--shell-chrome-h)]">
        <div className="flex min-h-0 min-w-0 flex-1 gap-1 px-2 pb-2">
          <ShellContentColumn mainClassName={mainClassName} desktop>
            {children}
          </ShellContentColumn>
          {ai}
        </div>
      </div>

      {topBar}
    </LayoutSidebarProvider>
  )
}
