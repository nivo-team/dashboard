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

/** 将 Tab 数据序列化并注入原生 DataTransfer */
export function setTabTransferData(dataTransfer: DataTransfer, tab: PageTab): void {
  const payload: TabTransferPayload = {
    to: tab.to,
    label: tab.label,
    labelKey: tab.labelKey,
    pinned: tab.pinned,
    sourceWindow: desktopWindowName(),
  }
  dataTransfer.setData(TAB_TRANSFER_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', tab.to)
  dataTransfer.effectAllowed = 'move'
}

/** 从原生 DataTransfer 中解析 Tab 数据，若格式不符或来自同一窗口则返回 null */
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

/** 广播 Tab 已成功被目标窗口接收并转移 */
export function broadcastTabTransferred(payload: TabTransferPayload): void {
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
      onTransferred(event.data.payload)
    }
  }

  ch.addEventListener('message', handleMessage)
  return () => {
    ch.removeEventListener('message', handleMessage)
  }
}
