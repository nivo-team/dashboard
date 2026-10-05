import { createFileRoute, redirect } from '@tanstack/react-router'

/** 旧路由兼容重定向：`/$appId/example/user/$id` -> `/$appId/example/table/$id` */
export const Route = createFileRoute('/$appId/example/user/$id')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/example/table/$id',
      params: { appId: params.appId, id: params.id },
    })
  },
})
