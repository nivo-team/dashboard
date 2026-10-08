import { createFileRoute, redirect } from '@tanstack/react-router'

/** 旧路由兼容重定向：`/$appId/example/user/$id/edit` -> `/$appId/example/table/$id/edit` */
export const Route = createFileRoute('/$appId/example/user/$id/edit')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/example/table/$id/edit',
      params: { appId: params.appId, id: params.id },
    })
  },
})
