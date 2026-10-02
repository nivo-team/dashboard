import { createFileRoute } from '@tanstack/react-router'
import { AboutPage } from '#/features/settings/about'

/**
 * 设置 → 关于路由（`/_main/settings/about.tsx` -> "/settings/about"）—— **薄适配层**。
 * 页面本体与说明在 `#/features/settings/about`。
 */
export const Route = createFileRoute('/_main/settings/about')({
  component: AboutPage,
})
