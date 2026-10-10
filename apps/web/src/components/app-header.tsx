import { Breadcrumbs, Sidebar } from '@cloudflare/kumo'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { HeaderActions } from '#/components/header-actions'
import { handleDesktopHeaderDoubleClick } from '#/lib/desktop-bridge'
import { usePreferencesStore } from '#/lib/store'
import { useBreadcrumbs } from '#/lib/use-breadcrumbs'

interface AppHeaderProps {
  onOpenCommandPalette: () => void
  /** 切换 AI 面板（`AppShell` 持有它的展开状态，见 components/app-shell.tsx） */
  onToggleAskAi: () => void
  /** AI 面板当前是否展开：只用来给按钮画 `aria-expanded`（**不带视觉激活态**，见 `HeaderActions`） */
  isAskAiOpen: boolean
  /**
   * 行首那一格（面包屑所在的位置）的内容。
   *
   * 给了就**替掉面包屑**：页面标签条从这里进（见 `#/components/page-tab-strip`）。
   * 这一格只有一个位置，而标签条与面包屑是同一件事的两种说法（「你现在在哪」），
   * 同时出现就成了两套互相打架的答案。要不要给由外壳决定（设置项 + 是否桌面壳）。
   */
  leading?: ReactNode
}

export function AppHeader({
  onOpenCommandPalette,
  onToggleAskAi,
  isAskAiOpen,
  leading,
}: AppHeaderProps) {
  const crumbs = useBreadcrumbs()
  // AI 功能被关掉时，顶栏的入口整个不出现（面板那边也会被下面收起）
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  return (
    <header
      onDoubleClick={handleDesktopHeaderDoubleClick}
      className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-3 select-none md:px-4 drag"
    >
      {/* 移动端打开侧边栏按钮；大屏幕下隐藏 */}
      <Sidebar.Trigger className="md:hidden no-drag" />

      {/* 行首那一格：默认是面包屑导航；外壳给了 `leading`（页面标签条）就换掉 */}
      {leading ?? (
        <div className="min-w-0 flex-1">
          <Breadcrumbs size="sm">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <Breadcrumbs.Separator /> : null}
                  {crumb.href && !isLast ? (
                    <Breadcrumbs.Link href={crumb.href} className="no-drag">
                      {crumb.label}
                    </Breadcrumbs.Link>
                  ) : (
                    <Breadcrumbs.Current>{crumb.label}</Breadcrumbs.Current>
                  )}
                </Fragment>
              )
            })}
          </Breadcrumbs>
        </div>
      )}

      {/*
        行末工具区：与 MainLayout 顶栏共用同一组件。
        AI 入口与具体应用绑定，只有这里（带 appId 的业务外壳）才开 `showAskAi`。
      */}
      <HeaderActions
        showAskAi={aiEnabled}
        onAskAi={onToggleAskAi}
        askAiExpanded={isAskAiOpen}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    </header>
  )
}
