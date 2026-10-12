import { useSearch } from '@tanstack/react-router'
import { FeaturesRootPage } from './list'
import { NewFeaturePage } from './create'
import { FeatureNodePage } from './node'

/**
 * 菜单管理模块总控（`/$appId/system/menus` 与 `/$appId/system/menus/$`）。
 * 遵循 Single-Route 架构：无 splat 时展示根树表，splat='new' 时展示新建页，其它展示节点页（按目录/菜单分流）。
 */
export function MenusPage({ splat }: { splat?: string }) {
  const cleanSplat = splat?.replace(/^\/+|\/+$/g, '')
  const search = useSearch({ strict: false }) as { pid?: number; type?: 'group' | 'button' }

  if (cleanSplat === 'new') {
    return <NewFeaturePage pid={search.pid} type={search.type} />
  }

  if (cleanSplat) {
    return <FeatureNodePage featureId={cleanSplat} />
  }

  return <FeaturesRootPage />
}
