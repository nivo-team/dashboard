import { createFileRoute, redirect } from '@tanstack/react-router'
import { DataDictTypeDetailPage } from '#/features/system/data-dict/detail'
import { DICT_ROOT_TYPE_ID } from '#/features/system/data-dict/data-dict-options'

/**
 * 分类详情路由（`/$appId/system/data-dict/$typeId`）—— **薄适配层**。
 *
 * `beforeLoad` 留在这里（它是路由语义，不是页面逻辑）：根分类（67）自身就是模块边界，
 * 访问它等同于访问分类列表，直接规范化重定向，避免出现「自己作为分类」的重复视图。
 */
export const Route = createFileRoute('/$appId/system/data-dict/$typeId')({
  beforeLoad: ({ params }) => {
    if (Number(params.typeId) === DICT_ROOT_TYPE_ID) {
      throw redirect({
        to: '/$appId/system/data-dict',
        params: { appId: params.appId },
      })
    }
  },
  component: DataDictTypeDetailRoute,
})

function DataDictTypeDetailRoute() {
  const { typeId } = Route.useParams()
  return <DataDictTypeDetailPage typeId={typeId} />
}
