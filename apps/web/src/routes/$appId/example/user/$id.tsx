import { createFileRoute } from '@tanstack/react-router'
import { TableExampleDetailPage } from '#/features/table-example/detail-page'

/** 表格示例详情路由（`/$appId/example/user/$id`）—— 薄适配层，业务在 `src/features`。 */
export const Route = createFileRoute('/$appId/example/user/$id')({
  component: TableExampleDetailRoute,
})

function TableExampleDetailRoute() {
  const { appId, id } = Route.useParams()
  return <TableExampleDetailPage appId={appId} id={id} />
}
