import { TooltipProvider } from '@cloudflare/kumo'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBrand } from '#/lib/brand'
import { useLocale } from '#/lib/use-locale'

/**
 * 全局根布局（挂在 `__root.tsx`，**整个应用只此一处**）。
 *
 * 职责：
 *
 * 1. **统一挂载应用级 provider**（目前是 Kumo 的 `TooltipProvider`）——
 *    页面 / 模块组件不要再各自包一层，重复包裹除了多一层 DOM，还会让
 *    tooltip 的延迟与共享状态分裂成多份；
 * 2. **统一计算并同步书写方向（RTL）与语言标记**：`<html lang dir>` 在这里跟着
 *    `useLocale()` 走，页面不需要再做任何 document 操作，也不需要在根节点上
 *    自己判断方向；
 * 3. **统一同步全局品牌标题**：确保文档标题与全局品牌配置保持单一真值。
 *
 * 不额外包 DOM：方向是继承属性，挂在 `<html>` 上即可被全区（含 `[dir='rtl']` 选择器
 * 与 Tailwind 逻辑属性）命中；包一层 wrapper 反而可能打断 `h-screen` / sticky 的高度链。
 */
export function AppRootLayout({ children }: { children: ReactNode }) {
  const { locale, dir } = useLocale()
  const brand = useBrand()

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
    if (!document.title || document.title === 'Nivo Admin') {
      document.title = brand.name
    }
  }, [brand.name, dir, locale])

  return <TooltipProvider>{children}</TooltipProvider>
}
