import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '#/features/settings/profile'

/**
 * 设置 → 个人资料路由（`/_main/settings/profile.tsx` -> "/settings/profile"）—— **薄适配层**。
 * 页面本体与说明在 `#/features/settings/profile`。
 */
export const Route = createFileRoute('/_main/settings/profile')({
  component: ProfilePage,
})
