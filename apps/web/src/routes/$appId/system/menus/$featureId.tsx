import { createFileRoute, redirect } from '@tanstack/react-router'
import { FeatureNodePage } from '#/features/menus/node'
import { MENU_ROOT_ID } from '#/features/menus/feature-options'

/**
 * 功能 / 功能组节点路由（`/$appId/system/menus/$featureId`）—— **薄适配层**。
 *
 * `beforeLoad` 留在这里（路由语义）：根节点（482）自身不在接口返回的树里，
 * 访问它等同于访问根视图，直接规范化重定向。
 */
export const Route = createFileRoute('/$appId/system/menus/$featureId')({
  beforeLoad: ({ params }) => {
    if (Number(params.featureId) === MENU_ROOT_ID) {
      throw redirect({
        to: '/$appId/system/menus',
        params: { appId: params.appId },
      })
    }
  },
  component: FeatureNodeRoute,
})

function FeatureNodeRoute() {
  const { featureId } = Route.useParams()
  return <FeatureNodePage featureId={featureId} />
}
