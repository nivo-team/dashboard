/**
 * 「本次页面载入算不算重新载入」——设置里「新会话时机」的判定依据。
 *
 * 语义（`aiSessionMode === 'new'`）：**每份文档只开一段新会话**。同一份文档里把面板
 * 关掉再打开是接着上一段说；整页刷新、或在新标签页里打开，才算「重新载入」，从新会话
 * 开始。默认的 `continue` 不关心这里，它永远续上一个会话。
 *
 * 标记存在 `sessionStorage`：它按标签页隔离，每个标签页各有一份 —— 这正是「当前 tab」
 * 的粒度。**但它本身能活过刷新**，所以「刷新即清空」不是白来的：下面用 `pagehide`
 * 在整页卸载时主动删掉标记。只有 `persisted === false`（真的卸载，而不是 bfcache
 * 把文档冻结起来）才算一次重新载入 —— 从 bfcache 回来时这份文档根本没被重新执行，
 * 会话不该断。
 *
 * 模块级的 `decided` 只是同一次判定的缓存：一次页面载入只判定一次（哪个调用方先来都
 * 一样），顺带让开发期 HMR 重新求值本模块时读到 sessionStorage 里的标记、不误判成刷新。
 */

/** sessionStorage 键：这份文档是否已经「认领」过会话起点 */
const AI_SESSION_BOOT_KEY = 'admin.ai.sessionBooted'

let decided: boolean | null = null

/**
 * 本次页面载入是否算「重新载入」（刷新页面 / 新标签页）。
 *
 * 只判一次：同一份文档里后面的调用直接返回缓存值。
 */
export function isDocumentReload(): boolean {
  if (decided !== null) return decided

  try {
    if (sessionStorage.getItem(AI_SESSION_BOOT_KEY) !== null) {
      decided = false
      return decided
    }
    sessionStorage.setItem(AI_SESSION_BOOT_KEY, '1')
  } catch {
    // 隐私模式 / 存储被禁：当作「首次载入」，行为退化为每份文档一段新会话
  }

  decided = true
  return decided
}

/*
  整页卸载时删掉标记，下一次载入才会被判成「重新载入」。
  被 bfcache 冻结（`persisted`）不算卸载：那份文档还会原样回来。
*/
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return
    try {
      sessionStorage.removeItem(AI_SESSION_BOOT_KEY)
    } catch {
      // 存储不可用：标记本来也没写进去，无需清理
    }
  })
}
