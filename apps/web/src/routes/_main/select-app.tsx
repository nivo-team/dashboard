import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 兼容旧 /select-app 路径，统一重定向至根路径 /
 */
export const Route = createFileRoute('/_main/select-app')({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: '/',
      search: location.search,
    })
  },
})
