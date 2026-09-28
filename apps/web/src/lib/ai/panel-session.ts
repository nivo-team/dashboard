/**
 * AI 面板 / 全屏对话页之间的**会话级记忆**（sessionStorage）。
 *
 * 只有两件事，都是「同一标签页里跨路由、但不跨浏览器会话」的 UI 状态：
 *
 * 1. **面板是否展开**：点「最大化」跳去 `/$appId/sphere` 时，`AppShell` 会整体卸载 ——
 *    展开状态如果只放在组件 state 里，返回时就被重置成「收起」了。放 sessionStorage
 *    之后，回到原页面面板还是展开的。
 * 2. **从哪一页最大化的**：`/sphere` 的「收起」要回到**展开时的那一页**（而不是应用首页），
 *    所以点最大化时把当时的 `href` 记下来（含查询串，筛选条件能一起还原）。
 *
 * 为什么不放 localStorage / 偏好 store：这两件事都是「这一次浏览」的上下文，
 * 新开一个标签页应该从干净的默认值开始。也因此不按 app 分区 —— 记的就是一条完整 href。
 *
 * 读写全部包了 try/catch：隐私模式或禁用 storage 时 `sessionStorage` 会直接抛异常，
 * 这层记忆丢了最多是「回到首页 / 面板收起」，不该把整页拖垮。
 */

/** 面板展开状态：`'true'` / `'false'`。 */
const PANEL_OPEN_KEY = 'admin.ai-panel-open'
/** 最大化前所在页面的完整 href（含查询串与 hash）。 */
const MAXIMIZE_ORIGIN_KEY = 'admin.ai-maximize-origin'

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    // 隐私模式 / 禁用 storage：静默降级成「不记」
  }
}

/** 面板这一次浏览里是不是展开的（没有记录时按「收起」）。 */
export function readAiPanelOpen(): boolean {
  return read(PANEL_OPEN_KEY) === 'true'
}

/** 记住面板的开合状态（每次变化都写）。 */
export function persistAiPanelOpen(open: boolean): void {
  write(PANEL_OPEN_KEY, open ? 'true' : 'false')
}

/** 记住「从哪一页最大化的」，供 `/sphere` 的收起按钮回跳。 */
export function rememberMaximizeOrigin(href: string): void {
  write(MAXIMIZE_ORIGIN_KEY, href)
}

/** 读回最大化前的页面 href；没有记录（例如直接输 URL 进 `/sphere`）返回 `null`。 */
export function readMaximizeOrigin(): string | null {
  return read(MAXIMIZE_ORIGIN_KEY)
}
