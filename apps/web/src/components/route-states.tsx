import { Button, Loader } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react'

/**
 * 路由级加载态。
 *
 * 关键点：这些组件由 router 的 `default*Component` 挂载在**当前路由的位置**，
 * 也就是父级 layout 的 <Outlet /> 处。因此加载/报错时：
 * - 侧边栏、顶栏等外壳不会被卸载或重新挂载；
 * - 其它页面各自的异步状态互不影响，切换页面不会互相卡顿。
 */
export function RoutePending() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center">
      <Loader />
    </div>
  )
}

/** 路由级错误边界：同样只替换内容区。 */
export function RouteError({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : '发生了未知错误，可以重试或返回上一页。'

  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-kumo-danger-tint text-kumo-danger">
        <WarningCircleIcon size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-kumo-default">
          页面加载失败
        </h2>
        <p className="max-w-md text-sm text-kumo-subtle">{message}</p>
      </div>
      <Button variant="secondary" onClick={reset}>
        重试
      </Button>
    </div>
  )
}
