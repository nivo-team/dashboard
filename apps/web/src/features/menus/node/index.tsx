import { Button, Empty, LayerCard, Loader } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { FeatureContainer } from '../feature-container'
import { FeatureDetail } from '../feature-detail'
import { useFeature } from '#/features/ai/page'
import { createFeatureNodeFeature } from './feature'
import { findMenuPath, menuIsGroup } from '../feature-options'
import { useFeaturesTree } from '../use-features-tree'

/**
 * 功能 / 功能组的节点视图（/$appId/system/menus/$featureId）—— **同路由按类型分流**。
 *
 * 这是「功能组没有详情页」这条规则的落点：
 *
 * - 节点是功能组（`menu_type=1`）→ 渲染容器视图（`FeatureContainer`），展示它的子项，可继续嵌套；
 * - 节点是功能（`menu_type=2`）→ 渲染详情视图（`FeatureDetail`），展示基本信息与子项；
 * - 节点是操作（`menu_type=3`）→ 详情视图（无创建入口语义变化，仅供参考）。
 *
 * 节点自身与祖先链都来自 `useFeaturesTree()` 的整棵功能树（`findMenuPath`），
 * 不再依赖 `tree` 接口的 `result[0]` 位置约定 —— 该接口返回的是**直接子节点数组**，
 * 不含被请求节点自身。
 */
/**
 * 功能 / 功能组的节点视图。`featureId` 由薄路由传入
 * （根节点 482 的重定向也留在那边的 `beforeLoad` 里）。
 */
export function FeatureNodePage({ featureId }: { featureId: string }) {
  const { t } = useTranslation('menus')
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const { nodes, isPending, error, refetch } = useFeaturesTree()

  const numericId = Number(featureId)
  const hasValidId = Number.isFinite(numericId)

  /** 在功能树中定位当前节点，用于决定渲染容器视图还是详情视图。 */
  const { node } = useMemo(
    () => (hasValidId ? findMenuPath(nodes, numericId) : { node: undefined }),
    [hasValidId, nodes, numericId],
  )

  /*
    这一页对 AI 暴露的能力（原先什么都没接）：当前节点数据源 + 重新取数。
    节点是页面自己定位的（`findMenuPath`），所以不需要子组件上报。
  */
  useFeature(
    createFeatureNodeFeature({
      node,
      loading: isPending,
      reload: refetch,
    }),
  )

  const goRoot = () => {
    void navigate({ to: '/$appId/system/menus', params: { appId } })
  }

  if (!hasValidId) {
    return (
      <FeatureErrorState
        message={t('detail.invalidId', 'ID 不合法')}
        retryLabel={t('detail.retry', '重试加载')}
        backLabel={t('detail.backToList', '返回列表')}
        onRetry={() => void refetch()}
        onBack={goRoot}
      />
    )
  }

  if (!node) {
    // 首次加载尚未拿到数据时先出 loader，避免把「还没加载」误报成「未找到」
    if (isPending) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader size="base" />
        </div>
      )
    }

    return (
      <FeatureErrorState
        message={
          (error as { message?: string } | null)?.message ?? t('detail.notFound', '未找到该功能')
        }
        retryLabel={t('detail.retry', '重试加载')}
        backLabel={t('detail.backToList', '返回列表')}
        onRetry={() => void refetch()}
        onBack={goRoot}
      />
    )
  }

  return menuIsGroup(node) ? <FeatureContainer node={node} /> : <FeatureDetail node={node} />
}

/** 节点不存在 / 请求失败时的兜底视图。 */
function FeatureErrorState({
  message,
  retryLabel,
  backLabel,
  onRetry,
  onBack,
}: {
  message: string
  retryLabel: string
  backLabel: string
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <LayerCard className="p-0">
      <LayerCard.Primary className="p-0">
        <Empty
          icon={<WarningCircleIcon size={44} className="text-kumo-inactive" />}
          title={message}
        />
        <div className="flex justify-center gap-2 pb-6">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
      </LayerCard.Primary>
    </LayerCard>
  )
}
