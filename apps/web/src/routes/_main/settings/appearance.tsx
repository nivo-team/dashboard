import { createFileRoute } from '@tanstack/react-router'
import { AppearanceSettingsPage } from '#/features/settings/appearance'

/**
 * 设置 → 外观路由（`/_main/settings/appearance.tsx` -> "/settings/appearance"）—— **薄适配层**。
 * 页面本体与说明在 `#/features/settings/appearance`。
 */
export const Route = createFileRoute('/_main/settings/appearance')({
  component: AppearanceSettingsPage,
})
