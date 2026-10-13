import type { PageTab } from '#/lib/page-tabs'
import { desktopWindowName } from './bridge'

export const TAB_TRANSFER_MIME = 'application/x-nivo-tab'

export interface TabTransferPayload {
  to: string
  label: string
  labelKey?: string
  pinned?: boolean
  sourceWindow: string
}

export interface TabTransferMessage {
  type: 'TAB_TRANSFERRED'
  payload: TabTransferPayload
}

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('nivo-tab-transfer')
  }
  return channel
}

/** 判断一个窗口是否属于支持 Tabs 交换的白名单窗口（仅限 main 窗口与 page_* 页面窗口） */
export function isTabExchangeAllowedWindow(windowName: string): boolean {
  if (windowName === 'main') return true
  if (windowName.startsWith('page_') || windowName.startsWith('standalone_')) return true
  return false
}

/** 当前窗口本地发起的拖拽会话状态 */
interface LocalDragSession {
  tab: PageTab
  sourceWindow: string
  isHandled: boolean
}

let localDragSession: LocalDragSession | null = null
let lastTransferredTo = ''
let lastTransferredAt = 0

/** 开始一次 Tab 拖拽 */
export function startTabDragSession(dataTransfer: DataTransfer, tab: PageTab): void {
  const currentWindow = desktopWindowName()
  localDragSession = {
    tab,
    sourceWindow: currentWindow,
    isHandled: false,
  }

  const payload: TabTransferPayload = {
    to: tab.to,
    label: tab.label,
    labelKey: tab.labelKey,
    pinned: tab.pinned,
    sourceWindow: currentWindow,
  }

  dataTransfer.setData(TAB_TRANSFER_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', tab.to)
  dataTransfer.effectAllowed = 'move'
}

/** 标记当前拖拽已在某个合法位置（本窗口排序或目标窗口合并）被接收安置 */
export function markDragHandled(): void {
  if (localDragSession) {
    localDragSession.isHandled = true
  }
}

/** 结束本次拖拽会话并返回会话对象 */
export function endTabDragSession(): LocalDragSession | null {
  const session = localDragSession
  localDragSession = null
  return session
}

/** 从原生 DataTransfer 中解析 Tab 数据 */
export function getTabTransferData(dataTransfer: DataTransfer): TabTransferPayload | null {
  try {
    const raw = dataTransfer.getData(TAB_TRANSFER_MIME)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TabTransferPayload
    if (parsed && typeof parsed.to === 'string') {
      return parsed
    }
  } catch {
    // 忽略解析异常
  }
  return null
}

/** 记录最近一次被跨窗口接收的 Tab */
export function markTabReceivedByOtherWindow(to: string): void {
  lastTransferredTo = to
  lastTransferredAt = Date.now()
}

export function wasTabRecentlyTransferred(to: string): boolean {
  if (lastTransferredTo === to && Date.now() - lastTransferredAt < 500) {
    return true
  }
  return false
}

/** 检测释放点是否确实在当前窗口外边界之外 */
export function isDragReleasedOutsideWindow(event: React.DragEvent | DragEvent): boolean {
  if (typeof window === 'undefined') return false
  const x = event.screenX
  const y = event.screenY
  if (x === 0 && y === 0) return false

  const winX = window.screenX ?? 0
  const winY = window.screenY ?? 0
  const winW = window.outerWidth ?? window.innerWidth
  const winH = window.outerHeight ?? window.innerHeight

  return x < winX - 20 || x > winX + winW + 20 || y < winY - 20 || y > winY + winH + 20
}

/** 广播 Tab 已成功被目标窗口接收并转移 */
export function broadcastTabTransferred(payload: TabTransferPayload): void {
  markTabReceivedByOtherWindow(payload.to)
  const ch = getChannel()
  if (ch) {
    ch.postMessage({
      type: 'TAB_TRANSFERRED',
      payload,
    } satisfies TabTransferMessage)
  }
}

/** 监听跨窗口 Tab 转移广播，用于源窗口移除已转移的 Tab */
export function subscribeTabTransferred(
  onTransferred: (payload: TabTransferPayload) => void,
): () => void {
  const ch = getChannel()
  if (!ch) return () => {}

  const handleMessage = (event: MessageEvent<TabTransferMessage>) => {
    if (event.data?.type === 'TAB_TRANSFERRED') {
      markTabReceivedByOtherWindow(event.data.payload.to)
      onTransferred(event.data.payload)
    }
  }

  ch.addEventListener('message', handleMessage)
  return () => {
    ch.removeEventListener('message', handleMessage)
  }
}
