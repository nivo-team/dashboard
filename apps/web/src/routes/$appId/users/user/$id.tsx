import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAiPageContext } from '#/lib/ai'
import { UserDetailView } from './-components/user-detail-view'

/**
 * 用户运营 / 用户列表 / 用户详情（/$appId/users/user/$id）
 *
 * 这层路由只做两件事：取 URL 参数、给「返回列表」接上导航。
 * **详情本身在 `-components/user-detail-view.tsx`** —— 它与表格的详情预览浮层
 * （`#/components/detail-preview`）共用同一个组件，所以详情页与分屏里看到的
 * 是同一份 UI，不会随功能迭代分叉。
 */
export const Route = createFileRoute('/$appId/users/user/$id')({
  component: UserDetailPage,
})

function UserDetailPage() {
  const navigate = useNavigate()
  const { appId, id } = Route.useParams()

  /*
    把「这个页面实际是怎么取数的」告诉 AI：详情复用列表接口 GET /user，
    按关键词精确查询一条（见 -data/user-detail.ts）。

    参数明细不用写在这里 —— get_page_context 会从 openapi 索引自动补上。
  */
  useAiPageContext(Route.id, {
    description: '用户详情：查看单个用户的资料（昵称、邮箱、注册时间等）。',
    entities: ['用户', '昵称', '邮箱', '注册时间'],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        purpose: '按关键词查一个用户（page_size=1）—— 本页就是这么取详情的',
      },
    ],
  })

  return (
    <UserDetailView
      id={id}
      onBack={() => navigate({ to: '/$appId/users/user', params: { appId } })}
    />
  )
}
