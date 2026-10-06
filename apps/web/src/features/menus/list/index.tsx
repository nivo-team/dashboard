import { useState } from 'react'
import { useFeature } from '#/features/ai/page'
import { FeatureContainer } from '../feature-container'
import type { FeatureContainerSnapshot } from '../feature-container'
import { createFeatureTreeListFeature } from './feature'

/**
 * 功能根视图（/$appId/system/menus）。
 *
 * 渲染新架构根节点（`MENU_ROOT_ID = 482`）的直接子项 —— 内容取自
 * `GET /system/menu/tree?menu_id=482` 返回数组本身（该接口不含被请求节点自身）。
 * 功能组与功能都从这一层开始下钻，由 `$featureId.tsx` 按 `menu_type` 分流。
 */
export function FeaturesRootPage() {
  // 容器把「这一层有哪些行」上报上来（推导只在那一边有一份），页面只负责接进 AI 数据源
  const [snapshot, setSnapshot] = useState<FeatureContainerSnapshot | null>(null)
  useFeature(createFeatureTreeListFeature({ snapshot }))

  return <FeatureContainer onData={setSnapshot} />
}
