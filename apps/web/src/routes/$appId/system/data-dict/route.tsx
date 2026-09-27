import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 数据字典子模块根路由（/$appId/system/data-dict）。
 *
 * 目录化约定：模块以目录承载，模块根 `route.tsx` 是模块边界，子模块继续用子目录组织。
 * 本模块对外有两个落点：
 * - `index.tsx`：分类列表（分类树表，可下钻）；
 * - `$typeId.tsx`：某个分类下的子分类与字典项（**下钻式**，与 features 一致）。
 */
export const Route = createFileRoute('/$appId/system/data-dict')({
  component: SystemDataDictModuleLayout,
})

function SystemDataDictModuleLayout() {
  return <Outlet />
}
