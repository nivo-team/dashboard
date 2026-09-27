import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from '#/components/not-found'

/**
 * _main 通用外壳内局部 404 兜底路由
 */
export const Route = createFileRoute('/_main/$')({
  component: NotFound,
})
