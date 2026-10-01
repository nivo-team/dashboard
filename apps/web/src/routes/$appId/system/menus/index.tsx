import { createFileRoute } from '@tanstack/react-router'
import { FeaturesRootPage } from '#/features/system/menus/list'

/** 功能根视图路由（`/$appId/system/menus`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/system/menus/')({
  component: FeaturesRootPage,
})
