import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 设置模块入口：`/settings` 没有独立落地页，
 * 访问时统一重定向到默认子模块「个人资料」`/settings/profile`。
 */
export const Route = createFileRoute('/_main/settings/')({
  beforeLoad: () => {
    throw redirect({
      to: '/settings/profile',
    })
  },
})
