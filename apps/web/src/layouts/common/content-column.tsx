import type { ReactNode } from 'react'
import { isDesktopMac } from '#/native/bridge'
import { cn } from '#/lib/cn'

/**
 * 内容列容器：顶栏（浏览器才有）+ `<main data-shell-content>`。
 *
 * 供各布局变体统一组织内容区盒子与滚动特性。
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
  const isMac = isDesktopMac()
  const desktopRoundedClass = desktop ? (isMac ? 'rounded-lg' : 'rounded-md') : ''

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        !desktop && 'bg-kumo-canvas',
        desktop && 'h-full min-h-0 overflow-hidden',
        desktopRoundedClass,
      )}
    >
      {header}

      <main
        data-shell-content
        className={cn(
          'min-w-0 flex-1',
          desktop && cn('min-h-0 overflow-y-auto bg-kumo-canvas', desktopRoundedClass),
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  )
}
