import { useSyncExternalStore } from 'react'
import { SHELL_MOBILE_BREAKPOINT } from './store/shell-ui-store'

/**
 * 当前视口是否为「移动端」（与外壳抽屉的断点同源：`SHELL_MOBILE_BREAKPOINT`）。
 *
 * 用途是**能力开关**而不是样式断点：某些交互在窄屏上根本成立不了
 * （例如表格详情预览的「分屏」与「侧滑抽屉」—— 视口放不下并列内容），
 * 这类判断必须走 JS 而不是 CSS，因为要影响的是「走哪条逻辑」而不是「长什么样」。
 *
 * 实现用 `useSyncExternalStore` 直接订阅 `matchMedia`：
 * - 首帧就是真实值（不像 `useState` + `useEffect` 会先渲染一帧错误分支再纠正）；
 * - 视口跨过断点时（拖窗口、转屏）组件会重渲染，行为即时切换。
 *
 * 命令式的场合（事件回调里判断一次）用 `#/lib/store` 的 `isDesktopViewport()`，
 * 两者共用同一个断点常量，不会漂移。
 */
const DESKTOP_QUERY = `(min-width: ${SHELL_MOBILE_BREAKPOINT}px)`

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mediaQuery = window.matchMedia(DESKTOP_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

/** 没有 window（非浏览器环境）时按桌面处理：预览能力可用，不静默降级成跳页。 */
function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return !window.matchMedia(DESKTOP_QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
