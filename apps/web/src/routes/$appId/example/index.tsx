import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 示例模块入口：`/example` 无独立落地页，
 * 访问时统一重定向到默认子页「表格示例」`/$appId/example/user`。
 */
export const Route = createFileRoute('/$appId/example/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appId/example/user',
      params: { appId: params.appId },
    })
  },
})
