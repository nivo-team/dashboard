import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 用户运营模块入口：/users 无独立落地页，
 * 访问时统一重定向到默认子模块「用户列表」/$appId/users/user。
 */
export const Route = createFileRoute('/$appId/users/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/users/user',
      params: { appId: params.appId },
    })
  },
})
