import { createFileRoute } from '@tanstack/react-router'
import { FeaturesRootPage } from '#/features/system/features/list'

/** 功能根视图路由（`/$appId/system/features`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/system/features/')({
  component: FeaturesRootPage,
})
