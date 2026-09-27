import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 访问 /$appId 根路径时，自动重定向至默认主页 /$appId/home
 */
export const Route = createFileRoute('/$appId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/home',
      params: { appId: params.appId },
    })
  },
})
