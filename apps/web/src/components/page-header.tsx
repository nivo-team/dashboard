import { Breadcrumbs } from '@cloudflare/kumo'
import { Fragment } from 'react'
import type { ReactNode } from 'react'

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  /**
   * 页面标题。**放宽为 ReactNode** 是为了能在标题旁挂徽章（如 Beta）——
   * 纯放宽，原来传字符串的调用方都还合法。
   */
  title: ReactNode
  /** 描述文案；支持传入富文本（如带分隔符与演示模式标记的行内内容）。 */
  description?: ReactNode
  /**
   * 页面内自定义面包屑（可选）。
   * 顶栏已经承载了全局面包屑，页面通常不需要重复展示；
   * 若传入 crumbs，则会在标题上方渲染。
   */
  crumbs?: Crumb[]
  /** 右侧操作区。 */
  actions?: ReactNode
  children?: ReactNode
}

/**
 * 页面标题区：可选页面内面包屑 + 标题 + 描述 + 操作按钮。
 */
export function PageHeader({ title, description, crumbs, actions, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      {crumbs && crumbs.length > 0 ? (
        <Breadcrumbs>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <Breadcrumbs.Separator /> : null}
                {crumb.to && !isLast ? (
                  <Breadcrumbs.Link href={crumb.to}>{crumb.label}</Breadcrumbs.Link>
                ) : (
                  <Breadcrumbs.Current>{crumb.label}</Breadcrumbs.Current>
                )}
              </Fragment>
            )
          })}
        </Breadcrumbs>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-kumo-default">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-kumo-subtle">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  )
}
