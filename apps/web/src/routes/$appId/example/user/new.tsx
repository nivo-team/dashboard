import { createFileRoute, redirect } from '@tanstack/react-router'

/** 旧路由兼容重定向：`/$appId/example/user/new` -> `/$appId/example/table/new` */
export const Route = createFileRoute('/$appId/example/user/new')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/example/table/new',
      params: { appId: params.appId },
    })
  },
})
