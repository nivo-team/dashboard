import { Breadcrumbs } from '@cloudflare/kumo'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { HeaderActions } from '#/components/header-actions'
import { usePreferencesStore } from '#/lib/store'
import { useBreadcrumbs } from '#/lib/use-breadcrumbs'

export interface DefaultAppHeaderProps {
  onOpenCommandPalette: () => void
  onToggleAskAi: () => void
  isAskAiOpen: boolean
  leading?: ReactNode
}

/**
 * Web 通用版本的业务顶栏：
 * - 左侧展示页面标签条（leading）或路径面包屑；
 * - 右侧展示 Ask AI 入口与工具栏。
 */
export function DefaultAppHeader({
  onOpenCommandPalette,
  onToggleAskAi,
  isAskAiOpen,
  leading,
}: DefaultAppHeaderProps) {
  const crumbs = useBreadcrumbs()
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)

  return (
    <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-4 select-none">
      {leading ?? (
        <div className="min-w-0 flex-1">
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
