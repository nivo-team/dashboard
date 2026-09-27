import { createFileRoute } from '@tanstack/react-router'
import { FeatureContainer } from './-components/feature-container'

/**
 * 功能根视图（/$appId/system/features）。
 *
 * 渲染新架构根节点（`MENU_ROOT_ID = 482`）的直接子项 —— 内容取自
 * `GET /system/menu/tree?menu_id=482` 返回数组本身（该接口不含被请求节点自身）。
 * 功能组与功能都从这一层开始下钻，由 `$featureId.tsx` 按 `menu_type` 分流。
 */
export const Route = createFileRoute('/$appId/system/features/')({
  component: FeaturesRootPage,
})

function FeaturesRootPage() {
  return <FeatureContainer />
}
