import { isDesktop } from '#/native/bridge'
import { DesktopShellLayout } from '#/layouts/desktop/shell-layout'
import { BrowserShellLayout } from './browser-shell-layout'
import type { LayoutSlots } from '#/layouts/types'

/**
 * 兼容旧引用的通用 ShellLayout 分派组件。
 */
export function ShellLayout(props: LayoutSlots) {
  return isDesktop() ? <DesktopShellLayout {...props} /> : <BrowserShellLayout {...props} />
}
