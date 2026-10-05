import { createFileRoute, redirect } from '@tanstack/react-router'

/** 旧路由兼容重定向：`/$appId/example/user` -> `/$appId/example/table` */
export const Route = createFileRoute('/$appId/example/user/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/example/table',
      params: { appId: params.appId },
    })
  },
})
