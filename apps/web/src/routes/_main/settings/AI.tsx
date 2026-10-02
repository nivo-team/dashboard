import { createFileRoute } from '@tanstack/react-router'
import { AiSettingsPage } from '#/features/settings/ai'

/**
 * 设置 → AI 路由（`/_main/settings/AI.tsx` -> "/settings/AI"）—— **薄适配层**。
 * 页面本体与说明在 `#/features/settings/ai`（文件名小写；路由文件名保留大写缩写）。
 */
export const Route = createFileRoute('/_main/settings/AI')({
  component: AiSettingsPage,
})
