import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from '#/components/not-found'

/**
 * 业务外壳内局部 404 兜底路由（/$appId/$）
 */
export const Route = createFileRoute('/$appId/$')({
  component: NotFound,
})
