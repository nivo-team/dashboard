import { Breadcrumbs, Sidebar } from '@cloudflare/kumo'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { HeaderActions } from '#/components/header-actions'
import { usePreferencesStore } from '#/lib/store'
import { useBreadcrumbs } from '#/lib/use-breadcrumbs'

export interface MobileAppHeaderProps {
  onOpenCommandPalette: () => void
  onToggleAskAi: () => void
  isAskAiOpen: boolean
  leading?: ReactNode
}

/**
 * 移动端专属业务顶栏：
 * 1. 深度适配顶部状态栏安全区（safe-area-inset-top）；
 * 2. 包含汉堡按钮（Sidebar.Trigger）用于打开全屏抽屉侧边栏；
 * 3. 紧凑排布面包屑与工具操作区。
 */
export function MobileAppHeader({
  onOpenCommandPalette,
  onToggleAskAi,
  isAskAiOpen,
  leading,
}: MobileAppHeaderProps) {
  const crumbs = useBreadcrumbs()
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  return (
    <header className="sticky top-0 z-10 flex h-[calc(58px+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-3 pt-[env(safe-area-inset-top,0px)] select-none">
      <Sidebar.Trigger />

      {leading ?? (
        <div className="min-w-0 flex-1 truncate">
          <Breadcrumbs size="sm">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <Breadcrumbs.Separator /> : null}
                  {crumb.href && !isLast ? (
                    <Breadcrumbs.Link href={crumb.href}>{crumb.label}</Breadcrumbs.Link>
                  ) : (
                    <Breadcrumbs.Current>{crumb.label}</Breadcrumbs.Current>
                  )}
                </Fragment>
              )
            })}
          </Breadcrumbs>
        </div>
      )}

      <HeaderActions
        showAskAi={aiEnabled}
        onAskAi={onToggleAskAi}
        askAiExpanded={isAskAiOpen}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    </header>
  )
}
