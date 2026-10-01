import { createFileRoute, redirect } from '@tanstack/react-router'
import { hasPermission } from '#/lib/permissions'

/**
 * 系统管理模块入口：/system 无独立落地页，
 * 访问时按用户拥有的子模块读取权限智能重定向至对应子页面。
 */
export const Route = createFileRoute('/$appId/system/')({
  beforeLoad: ({ params }) => {
    if (hasPermission('feature:read')) {
      throw redirect({
        to: '/$appId/system/menus',
        params: { appId: params.appId },
      })
    }
    if (hasPermission('dict:read')) {
      throw redirect({
        to: '/$appId/system/data-dict',
        params: { appId: params.appId },
      })
    }
    if (hasPermission('role:read')) {
      throw redirect({
        to: '/$appId/system/roles',
        params: { appId: params.appId },
      })
    }
    throw redirect({
      to: '/$appId/home',
      params: { appId: params.appId },
    })
  },
})
