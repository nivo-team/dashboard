import { useAuthStore } from '#/lib/auth'
import { isDocumentReload } from './session-boot'

/**
 * 会话级权限授权管理（Session Grants）。
 *
 * 核心安全边界：
 * 1. 严格作用于特定的 chatSessionId：每个对话拥有独立的权限作用域，打开新会话绝不继承旧会话权限，防止权限乱串；
 * 2. 存储介质使用 sessionStorage：关闭标签页或浏览器生命周期结束立即失效，杜绝永久落盘风险；
 * 3. 刷新浏览器重新申请：当检测到页面重载（刷新）时，清空先前授权，AI 需重新弹出确认卡向用户申请权限；
 * 4. 同一会话内流畅执行：只要在当前页面会话内勾选了「本会话不再询问」，同一会话内的后续操作持续放行，避免多任务反复弹窗。
 */

const STORAGE_PREFIX = 'admin.ai.session-grants'

/**
 * **跳转能力的会话授权键** —— 它刻意不是工具名（`navigate_to`）。
 *
 * 用户同意的是「这个会话里可以带我去页面」这项**能力**：与用哪个工具实现无关。
 * 面板的确认卡（`AiApprovalRequest.kind === 'navigate'`）写的就是它，之后本会话内
 * 所有跳转都免确认（`chat.ts` 的 `requestApproval` 会先查 grant 再弹卡）。
 *
 * 与其它 grant 同一套边界：**按 chat session 隔离**、只存 sessionStorage、刷新即失效。
 * **全屏容器的建议卡不写它** —— 那一跳是用户自己点的，不该顺便授权 AI 自动跳。
 */
export const NAVIGATION_GRANT = 'navigate'

function getStorageKey(appId: string | null, sessionId: string | null): string {
  const safeAppId = appId || 'global'
  // 若会话尚未落盘（新对话初始状态），使用独立的草稿作用域
  const safeSessionId = sessionId || 'draft'
  return `${STORAGE_PREFIX}:${safeAppId}:${safeSessionId}`
}

/** 内存缓存加速，避免高频操作每次反序列化 JSON */
const memoryCache = new Map<string, Set<string>>()

/**
 * 清除当前标签页所有的会话授权（在页面重新载入/刷新时执行，落实「刷新重新申请」）
 */
function purgeAllSessionGrants(): void {
  memoryCache.clear()
  if (typeof window === 'undefined') return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => window.sessionStorage.removeItem(k))
  } catch {
    // 存储不可用时忽略
  }
}

// 刷新浏览器重新申请：每次整页重载时重置会话授权账本
if (typeof window !== 'undefined' && isDocumentReload()) {
  purgeAllSessionGrants()
}

function loadGrantsFromStorage(
  appId: string | null,
  sessionId: string | null,
): Set<string> {
  const key = getStorageKey(appId, sessionId)
  const cached = memoryCache.get(key)
  if (cached) return cached

  const grants = new Set<string>()
  if (typeof window === 'undefined') return grants

  try {
    const raw = window.sessionStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (typeof item === 'string') grants.add(item)
        })
      }
    }
  } catch {
    // 异常降级
  }

  memoryCache.set(key, grants)
  return grants
}

function saveGrantsToStorage(
  appId: string | null,
  sessionId: string | null,
  grants: Set<string>,
): void {
  const key = getStorageKey(appId, sessionId)
  memoryCache.set(key, grants)

  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...grants]))
  } catch {
    // 忽略存储异常
  }
}

/**
 * 判定指定工具在当前会话中是否已获得授权（免确认执行）
 * 严格绑定特定 sessionId：其他会话或新会话无法匹配
 */
export function hasSessionGrant(
  toolName: string,
  sessionId: string | null,
): boolean {
  const appId = useAuthStore.getState().currentApp?.id ?? null
  const grants = loadGrantsFromStorage(appId, sessionId)

  // 1. 精确工具名匹配
  if (grants.has(toolName)) return true

  // 2. 表单工具组整体授权
  if (
    grants.has('group:form') &&
    (toolName === 'open_form' ||
      toolName === 'fill_form' ||
      toolName === 'submit_form')
  ) {
    return true
  }

  return false
}

/**
 * 记录用户在当前会话中的授权决定。
 * 当 remember 为 true（「本会话不再询问」）时，写入 sessionStorage 并标记当前 chat session id。
 */
export function addSessionGrant(
  toolName: string,
  sessionId: string | null,
  remember = false,
): void {
  const appId = useAuthStore.getState().currentApp?.id ?? null
  const grants = loadGrantsFromStorage(appId, sessionId)

  grants.add(toolName)

  // 表单操作协同：当对表单唤起或提交授权时，整个表单组免除重复弹窗打断
  if (toolName === 'submit_form' || toolName === 'open_form') {
    grants.add('group:form')
    grants.add('open_form')
    grants.add('fill_form')
    grants.add('submit_form')
  }

  if (remember) {
    saveGrantsToStorage(appId, sessionId, grants)
  }
}

/**
 * 清除特定会话的权限授权（如会话删除或用户主动重置权限时）
 */
export function clearSessionGrants(sessionId: string | null): void {
  const appId = useAuthStore.getState().currentApp?.id ?? null
  const key = getStorageKey(appId, sessionId)
  memoryCache.delete(key)
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

/**
 * 列出特定会话已授权的工具名
 */
export function listSessionGrants(sessionId: string | null): string[] {
  const appId = useAuthStore.getState().currentApp?.id ?? null
  const grants = loadGrantsFromStorage(appId, sessionId)
  return [...grants]
}
