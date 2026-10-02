import { createFileRoute } from '@tanstack/react-router'
import { DataDictTypeListPage } from '#/features/data-dict/list'

/**
 * 数据字典分类列表路由（`/$appId/system/data-dict`）—— **薄适配层**。
 * 页面本体与 AI 特性声明在 `src/features/data-dict/list/`。
 */
export const Route = createFileRoute('/$appId/system/data-dict/')({
  component: DataDictTypeListPage,
})
