import { DataDictTypeListPage } from './list'
import { DataDictTypeDetailPage } from './detail'

/**
 * 数据字典模块总控（`/$appId/system/data-dict` 与 `/$appId/system/data-dict/$`）。
 * 遵循 Single-Route 架构：无 splat 时展示分类列表，有 splat 时展示分类详情（下钻）。
 */
export function DataDictPage({ splat }: { splat?: string }) {
  const cleanSplat = splat?.replace(/^\/+|\/+$/g, '')
  if (cleanSplat) {
    return <DataDictTypeDetailPage typeId={cleanSplat} />
  }
  return <DataDictTypeListPage />
}
