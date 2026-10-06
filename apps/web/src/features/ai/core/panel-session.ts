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
 * 3. **面板是被最大化带走的**：面板并没有被用户关掉，只是宿主 `AppShell` 被卸载了。
 *    回到原页面时面板理应「一直在开着」，所以这一次要**跳过面板自己的入场动画**
 *    （Float 从底部升起 / Split 宽度滑入）—— 否则同一块面板会连着演两遍「打开」。
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
/** 面板是不是被「最大化」带走的（回来时据此跳过面板重播的入场）。 */
const PANEL_MAXIMIZED_KEY = 'admin.ai-panel-maximized'

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

/**
 * 记下「面板被最大化带走了」：它没被关掉，只是宿主外壳卸载了。
 *
 * 与 `rememberMaximizeOrigin` 成对调用 —— 一个是回来的落点，一个是回来时的入场语义。
 */
export function markAiPanelMaximized(): void {
  write(PANEL_MAXIMIZED_KEY, 'true')
}

/**
 * 读「面板是被最大化带走的」——**纯读**，没有副作用。
 *
 * 刻意不做成「读一次就清」的消费函数：外壳要拿它当 `useState` 的惰性初值（首帧就得
 * 拿到），而渲染期的初始化函数在并发 / StrictMode 下可能被调用多次，那会把标记消费掉、
 * 跳过入场就失效了。清除是显式的一步，见 `clearAiPanelMaximized`。
 */
export function readAiPanelMaximized(): boolean {
  return read(PANEL_MAXIMIZED_KEY) === 'true'
}

/**
 * 清掉上面的标记：外壳在**首次渲染之后**调它（那一刻面板已经把跳过入场读成快照了）。
 *
 * 不清的话，之后任何一次外壳挂载都会被误判成「从最大化返回」，用户正常开关面板
 * （关闭再打开）就永远不再播入场动画。真正从 `/sphere` 收起回来时，
 * `markAiPanelMaximized` 会在离开前重新写上。
 */
export function clearAiPanelMaximized(): void {
  write(PANEL_MAXIMIZED_KEY, null)
}
