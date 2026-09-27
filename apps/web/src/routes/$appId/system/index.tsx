import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 系统管理模块入口：/system 无独立落地页，
 * 访问时统一重定向到默认子模块「功能」/$appId/system/features。
 */
export const Route = createFileRoute('/$appId/system/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/system/features',
      params: { appId: params.appId },
    })
  },
})
