import { Button, Empty, LayerCard, Loader } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { FeatureContainer } from './-components/feature-container'
import { FeatureDetail } from './-components/feature-detail'
import { MENU_ROOT_ID, findMenuPath, menuIsGroup } from './-data/feature-options'
import { useFeaturesTree } from './-data/use-features-tree'

/**
 * 功能 / 功能组的节点视图（/$appId/system/features/$featureId）—— **同路由按类型分流**。
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
export const Route = createFileRoute('/$appId/system/features/$featureId')({
  // 根节点（482）自身不在接口返回的树里，访问它等同于访问根视图
  beforeLoad: ({ params }) => {
    if (Number(params.featureId) === MENU_ROOT_ID) {
      throw redirect({
        to: '/$appId/system/features',
        params: { appId: params.appId },
      })
    }
  },
  component: FeatureNodePage,
})

function FeatureNodePage() {
  const { t } = useTranslation('features')
  const navigate = useNavigate()
  const { featureId } = Route.useParams()
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

  const goRoot = () => {
    navigate({ to: '/$appId/system/features', params: { appId } })
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
          (error as { message?: string } | null)?.message ??
          t('detail.notFound', '未找到该功能')
        }
        retryLabel={t('detail.retry', '重试加载')}
        backLabel={t('detail.backToList', '返回列表')}
        onRetry={() => void refetch()}
        onBack={goRoot}
      />
    )
  }

  return menuIsGroup(node) ? (
    <FeatureContainer node={node} />
  ) : (
    <FeatureDetail node={node} />
  )
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
