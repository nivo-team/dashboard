import { createFileRoute } from '@tanstack/react-router'
import { DataDictPage } from '#/features/data-dict'

/**
 * 数据字典分类列表路由（`/$appId/system/data-dict`）—— **薄适配层**。
 * 业务实现与下钻调度在 `src/features/data-dict/`。
 */
export const Route = createFileRoute('/$appId/system/data-dict/')({
  component: DataDictPage,
})
