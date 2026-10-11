import { isDesktop, isMobileDevice } from '#/native/bridge'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import type { LayoutVariant } from './types'

/**
 * 依据当前宿主环境与屏幕视口自动决策当前生效的布局变体：
 *
 * 1. `desktop`: 运行在 PC 桌面原生窗口壳（macOS / Windows / Linux），非移动端原生；
 * 2. `mobile`: 移动端原生壳（如 Android APK）或屏幕宽度处于移动端断点（< 768px）；
 * 3. `default`: 常规 Web 浏览器环境。
 */
export function useActiveLayout(): LayoutVariant {
  const isMobileView = useIsMobileViewport()

  if (isDesktop()) {
    return 'desktop'
  }

  if (isMobileDevice() || isMobileView) {
    return 'mobile'
  }

  return 'default'
}
