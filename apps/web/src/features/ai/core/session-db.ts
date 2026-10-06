import type { AiAttachment, AiMessage } from './types'

/**
 * AI 会话的本地存储（IndexedDB）。
 *
 * **为什么是 IndexedDB 而不是 localStorage**：一条会话带着工具调用的原始结果，
 * 几十上百 KB 很常见；localStorage 有 5 MB 硬上限、而且是**同步** API，
 * 每次落盘都会卡住主线程（流式回复期间尤其明显）。IndexedDB 异步、容量按配额走。
 *
 * 四个 store 的分工（**元数据、消息与草稿分开存**很关键）：
 * - `sessions`：只存 `{ id, appId, title, createdAt, updatedAt }` —— 会话列表要按时间排序展示，
 *   如果消息也塞在这里，每次开面板都要把全部会话的正文反序列化一遍；
 * - `messages`：`{ sessionId, messages }` —— 只有真正打开某个会话时才读；
 * - `meta`：每个 app 记住「上次打开的是哪个会话」；
 * - `drafts`：每个 session（及新会话）缓存对应的输入框未发送草稿内容（文本 + 附件）。
 *
 * **失败一律降级、不阻断对话**：隐私模式、配额耗尽、被别的标签页占着旧版本……
 * IndexedDB 打不开是完全可能的。所以每个函数都吞掉异常并返回安全值，
 * 让 AI 对话退化成「不持久化」而不是「用不了」。
 */

const DB_NAME = 'admin.ai'
const DB_VERSION = 2

const SESSION_STORE = 'sessions'
const MESSAGE_STORE = 'messages'
const META_STORE = 'meta'
const DRAFT_STORE = 'drafts'

/** 会话列表项（不含消息体）。 */
export interface AiSessionSummary {
  id: string
  appId: string
  title: string
  createdAt: number
  updatedAt: number
}

/** 一条完整会话（保存时用）。 */
export interface AiSessionRecord extends AiSessionSummary {
  messages: AiMessage[]
}

/** 输入框草稿项。 */
export interface AiComposerDraft {
  /** 复合键：`${appId}:${sessionId ?? '__new__'}` */
  key: string
  appId: string
  sessionId: string | null
  text: string
  attachments: AiAttachment[]
  updatedAt: number
}

function warn(action: string, error: unknown): void {
  // 降级是预期路径，但排查时需要线索，所以留一条 warn 而不是静默吞掉
  console.warn(`[ai/session-db] ${action} failed, falling back to memory only`, error)
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** 连接只开一次（单例 Promise），后续复用同一个连接。 */
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      warn('open', error)
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, { keyPath: 'id' })
        // 按 app 查列表 + 按更新时间排序，两个 index 都用得上
        store.createIndex('appId', 'appId', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        db.createObjectStore(MESSAGE_STORE, { keyPath: 'sessionId' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'appId' })
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      warn('open', request.error)
      resolve(null)
    }
  })

  return dbPromise
}

/** 当前 app 的会话列表，按最近更新倒序。 */
export async function listSessions(appId: string): Promise<AiSessionSummary[]> {
  const db = await openDb()
  if (!db) return []

  try {
    const tx = db.transaction(SESSION_STORE, 'readonly')
    const rows = await requestToPromise<AiSessionSummary[]>(
      tx.objectStore(SESSION_STORE).index('appId').getAll(appId),
    )
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (error) {
    warn('listSessions', error)
    return []
  }
}

/** 读某个会话的消息；没有（或读失败）时返回空数组。 */
export async function getSessionMessages(sessionId: string): Promise<AiMessage[]> {
  const db = await openDb()
  if (!db) return []

  try {
    const tx = db.transaction(MESSAGE_STORE, 'readonly')
    const row = await requestToPromise<{ sessionId: string; messages: AiMessage[] } | undefined>(
      tx.objectStore(MESSAGE_STORE).get(sessionId),
    )
    return row?.messages ?? []
  } catch (error) {
    warn('getSessionMessages', error)
    return []
  }
}

/** 整条会话落盘：元数据与消息在**同一个事务**里写，避免出现「有记录没消息」的半截状态。 */
export async function saveSession(record: AiSessionRecord): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    const tx = db.transaction([SESSION_STORE, MESSAGE_STORE], 'readwrite')
    const { messages, ...summary } = record
    tx.objectStore(SESSION_STORE).put(summary)
    tx.objectStore(MESSAGE_STORE).put({ sessionId: record.id, messages })
    await transactionDone(tx)
  } catch (error) {
    warn('saveSession', error)
  }
}

/** 删除会话（连同消息与草稿；如果它正是当前会话，顺手清掉 meta 里的指向）。 */
export async function deleteSession(sessionId: string, appId: string): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    const storeNames: string[] = [SESSION_STORE, MESSAGE_STORE, META_STORE]
    if (db.objectStoreNames.contains(DRAFT_STORE)) storeNames.push(DRAFT_STORE)

    const tx = db.transaction(storeNames, 'readwrite')
    tx.objectStore(SESSION_STORE).delete(sessionId)
    tx.objectStore(MESSAGE_STORE).delete(sessionId)
    if (db.objectStoreNames.contains(DRAFT_STORE)) {
      tx.objectStore(DRAFT_STORE).delete(makeDraftKey(appId, sessionId))
    }

    const metaStore = tx.objectStore(META_STORE)
    const meta = await requestToPromise<{ appId: string; activeSessionId?: string } | undefined>(
      metaStore.get(appId),
    )
    if (meta?.activeSessionId === sessionId) {
      metaStore.put({ appId, activeSessionId: null })
    }

    await transactionDone(tx)
  } catch (error) {
    warn('deleteSession', error)
  }
}

/** 读取该 app 上次打开的会话 id。 */
export async function getActiveSessionId(appId: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null

  try {
    const tx = db.transaction(META_STORE, 'readonly')
    const meta = await requestToPromise<{ appId: string; activeSessionId?: string | null } | undefined>(
      tx.objectStore(META_STORE).get(appId),
    )
    return meta?.activeSessionId ?? null
  } catch (error) {
    warn('getActiveSessionId', error)
    return null
  }
}

/** 记住该 app 当前打开的会话。 */
export async function setActiveSessionId(appId: string, sessionId: string | null): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put({ appId, activeSessionId: sessionId })
    await transactionDone(tx)
  } catch (error) {
    warn('setActiveSessionId', error)
  }
}

function makeDraftKey(appId: string, sessionId: string | null): string {
  return `${appId}:${sessionId ?? '__new__'}`
}

/**
 * 读取输入框未发送的草稿内容（按 appId 与 sessionId 隔离，new session 使用独立 key）。
 */
export async function getComposerDraft(
  appId: string,
  sessionId: string | null,
): Promise<{ text: string; attachments: AiAttachment[] } | null> {
  const db = await openDb()
  if (!db) return null

  try {
    if (!db.objectStoreNames.contains(DRAFT_STORE)) return null
    const tx = db.transaction(DRAFT_STORE, 'readonly')
    const row = await requestToPromise<AiComposerDraft | undefined>(
      tx.objectStore(DRAFT_STORE).get(makeDraftKey(appId, sessionId)),
    )
    return row ? { text: row.text, attachments: row.attachments ?? [] } : null
  } catch (error) {
    warn('getComposerDraft', error)
    return null
  }
}

/**
 * 保存输入框未发送的草稿内容（文本为空且无附件时自动清除）。
 */
export async function saveComposerDraft(
  appId: string,
  sessionId: string | null,
  text: string,
  attachments: readonly AiAttachment[] = [],
): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    if (!db.objectStoreNames.contains(DRAFT_STORE)) return
    const tx = db.transaction(DRAFT_STORE, 'readwrite')
    const key = makeDraftKey(appId, sessionId)
    if (!text.trim() && attachments.length === 0) {
      tx.objectStore(DRAFT_STORE).delete(key)
    } else {
      tx.objectStore(DRAFT_STORE).put({
        key,
        appId,
        sessionId,
        text,
        attachments: [...attachments],
        updatedAt: Date.now(),
      } satisfies AiComposerDraft)
    }
    await transactionDone(tx)
  } catch (error) {
    warn('saveComposerDraft', error)
  }
}

/**
 * 清除指定会话的输入框草稿。
 */
export async function deleteComposerDraft(
  appId: string,
  sessionId: string | null,
): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    if (!db.objectStoreNames.contains(DRAFT_STORE)) return
    const tx = db.transaction(DRAFT_STORE, 'readwrite')
    tx.objectStore(DRAFT_STORE).delete(makeDraftKey(appId, sessionId))
    await transactionDone(tx)
  } catch (error) {
    warn('deleteComposerDraft', error)
  }
}
