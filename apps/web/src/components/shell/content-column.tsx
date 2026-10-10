import type { ReactNode } from 'react'
import { cn } from '#/lib/cn'

/**
 * 内容列：顶栏（浏览器才有）+ `<main data-shell-content>`。
 *
 * 两个布局变体共用同一份 —— 差别只有「要不要顶栏」与「桌面壳那一套全高/滚动约束」，
 * 内容列自身不知道外面是窗口条还是顶栏。
 *
 * `<main>` 刻意**不自带 padding 与 max-w**：业务壳的详情分屏要贴住视口边缘，
 * padding 由 `DetailPreviewProvider` 分别发给两列；`_main` 外壳则通过 `mainClassName`
 * 把 padding 与页面宽度约束传进来。
 */
export function ShellContentColumn({
  header,
  mainClassName,
  desktop,
  children,
}: {
  /** 顶栏；桌面壳不传（窗口条取代它） */
  header?: ReactNode
  /** `<main>` 的额外类（外壳各自的 padding / 宽度约束） */
  mainClassName?: string
  /** 是否桌面壳形态（整列限制高度、内容区自己滚动） */
  desktop: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        // 浏览器里内容列自己铺底；桌面壳里底色挪到 <main> 上，圆角才看得出来
        !desktop && 'bg-kumo-canvas',
        desktop && 'h-full min-h-0 overflow-hidden',
      )}
    >
      {header}

      <main
        data-shell-content
        className={cn(
          'min-w-0 flex-1',
          desktop && 'min-h-0 overflow-y-auto rounded-md bg-kumo-canvas',
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  )
}
