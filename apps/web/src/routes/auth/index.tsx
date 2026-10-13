import { createFileRoute, redirect } from '@tanstack/react-router'

interface AuthSearch {
  redirect?: string
}

/**
 * 认证模块入口：`/auth` 没有独立落地页，访问时统一重定向至 `/auth/login`。
 */
export const Route = createFileRoute('/auth/')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/auth/login',
      search: {
        redirect: search.redirect,
      },
    })
  },
})
