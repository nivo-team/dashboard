import { create } from 'zustand'
import { getAppScope } from '#/lib/store/app-scope'
import {
  deleteSession as deleteSessionFromDb,
  getActiveSessionId,
  getSessionMessages,
  listSessions,
  saveSession,
  setActiveSessionId,
  type AiSessionSummary,
} from './session-db'
import { clearSessionGrants } from './session-permissions'
import type {
  AiApprovalRequest,
  AiAttachment,
  AiMessage,
  AiMessagePart,
  AiStreamEvent,
} from './types'

/**
 * AI 会话状态：**当前会话的消息** + **该 app 的历史会话列表**。
 *
 * 持久化走 IndexedDB（见 `./session-db`），按 app 分区 —— 与仓库其它 per-app 状态
 * （`admin.preferences:<appId>`、表格 UI、仪表盘布局）同一条约定：**跟数据域走**。
 * 会话是「这个应用里的对话」，切应用就该换一批；但会话内容本身不适合 localStorage
 * （带工具结果的正文很大，且 localStorage 是同步的），所以单独用 IDB。
 *
 * 三条写盘时机（都由 `chat.ts` 触发，UI 不直接调用）：
 * 1. 用户发送后**立刻**落盘 —— 助手回复中途刷新，问题不会丢；
 * 2. 助手回复结束 / 失败后落盘；
 * 3. 切会话、新建、删除时由本 store 自己处理。
 *
 * 流式过程中的每个 token **不写盘**：IDB 虽然异步，但一轮回复几十上百次事务没有意义，
 * 刷新丢的也只是半句话。
 */

export type AiSessionStatus = 'idle' | 'streaming' | 'error'

/** 一条等待用户决定的审批请求（`id` 由 `chat.ts` 生成，用来认领用户的点击）。 */
export interface PendingApproval extends AiApprovalRequest {
  id: string
}

interface AiSessionState {
  /** 该 app 的历史会话（元数据，不含消息体），按最近更新倒序 */
  sessions: AiSessionSummary[]
  /** 历史是否已加载（面板首次挂载时加载一次；切 app 会重置） */
  historyLoaded: boolean
  /**
   * 已加载历史对应的 app。
   *
   * 面板关闭时 `AiPanel` 会整体卸载，再打开就是一次重挂载 —— 如果没有这个标记，
   * `loadHistory` 会把消息重置回 IDB 里的版本，**把流式回复已经吐出来的增量抹掉**。
   */
  historyAppId: string | null
  /**
   * 当前会话 id。
   *
   * **`null` 表示「还没落盘的新对话」**：我们不为「点了新对话但没说话」建记录，
   * 否则列表里会堆一串空会话。它会在第一条消息落盘时被赋上真实 id。
   */
  activeSessionId: string | null

  messages: AiMessage[]
  status: AiSessionStatus
  /** 上一轮失败的原因（展示在会话末尾），成功后清空 */
  error: string | null
  /**
   * 正在等待用户确认的操作（同时只允许一个）。
   *
   * **它是阻塞性的**：工具的执行挂在 `chat.ts` 的 Promise 上，用户在 UI 上点了才会继续。
   * 因此不存在「队列」—— 模型的工具调用本来就是串行的。
   */
  pendingApproval: PendingApproval | null

  /**
   * 追加一条用户消息，并开一条空的助手消息（返回它的 id，后续事件都往它身上写）。
   *
   * `attachments` 是这一轮随文发出的**附件**（图片或普通文件，见 `AiAttachment`）：
   * 文本在前、附件在后 —— 与用户的输入顺序一致（先写话、再补附件）。**两者可以只有其一**。
   */
  beginTurn: (text: string, attachments?: readonly AiAttachment[]) => string
  /** 消费一个流式事件（text / tool-call / tool-result / …） */
  applyEvent: (assistantId: string, event: AiStreamEvent) => void
  /** 一轮正常结束 */
  endTurn: () => void
  /** 一轮异常结束 */
  failTurn: (message: string) => void
  /** 弹出一条审批请求 */
  setPendingApproval: (approval: PendingApproval) => void
  /** 收起审批请求（用户已决定，或这一轮被中止） */
  clearPendingApproval: () => void
  /** 把当前消息写进 IDB，并在需要时补上会话记录 */
  persist: () => Promise<void>

  /**
   * 加载该 app 的会话列表，并（默认）恢复上次打开的会话。
   *
   * `fresh: true` 时**只加载列表、不恢复**：直接停在「新会话」上 —— 供设置里的
   * 「刷新后新会话」（`aiSessionMode === 'new'`）使用。它由调用方在**本次页面载入是
   * 重新载入**时才传（`isDocumentReload()`，见 `#/lib/ai/session-boot`），所以同一份
   * 文档里把面板关掉再打开仍然是当前那段（那时本函数也会因「同一个 app 已加载」早退）。
   */
  loadHistory: (options?: { fresh?: boolean }) => Promise<void>
  /** 开一段新对话（不立刻建记录，等第一条消息） */
  startNewSession: () => void
  /** 切到某个历史会话 */
  switchSession: (sessionId: string) => Promise<void>
  /**
   * 该 app 里是否存在这个会话。
   *
   * 给全屏对话页的**路由校验**用（`/$appId/sphere/chat/$chatId`）：找不到就
   * `notFound()`。这里刻意直接读 IDB 而不是看 `sessions` 状态 —— loader 可能在
   * 会话列表加载完成之前就跑，用状态会误判成 404。
   */
  hasSession: (sessionId: string) => Promise<boolean>
  /** 删除一个历史会话（删的是当前会话时自动切到下一个） */
  removeSession: (sessionId: string) => Promise<void>
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 往助手消息里追加文本：优先续写最后一个文本 part，避免每个 token 生成一个 part。 */
function appendText(parts: AiMessagePart[], text: string): AiMessagePart[] {
  const last = parts[parts.length - 1]
  if (last && last.type === 'text') {
    const next = parts.slice(0, -1)
    next.push({ type: 'text', text: last.text + text })
    return next
  }
  return [...parts, { type: 'text', text }]
}

/** 更新某个工具调用 part 的状态（结果 / 失败），找不到就原样返回。 */
function patchToolCall(
  parts: AiMessagePart[],
  toolCallId: string,
  patch: Partial<Extract<AiMessagePart, { type: 'tool-call' }>>,
): AiMessagePart[] {
  return parts.map((part) =>
    part.type === 'tool-call' && part.toolCallId === toolCallId
      ? { ...part, ...patch }
      : part,
  )
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : String(value)
  } catch {
    return String(value)
  }
}

/**
 * 会话标题取**第一条用户消息**（截图里的历史列表就是这么显示的），
 * 不需要额外调模型去总结。空白字符压平、超长截断。
 *
 * 返回空串表示「这条会话还没有可用的标题」，由 UI 用 i18n 的「新对话」兜底。
 */
export function deriveSessionTitle(messages: readonly AiMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')
  const textPart = firstUser?.parts.find((part) => part.type === 'text')
  const text = textPart?.type === 'text' ? textPart.text : ''
  const flat = text.trim().replace(/\s+/g, ' ')
  if (!flat) return ''
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat
}

export const useAiSessionStore = create<AiSessionState>()((set, get) => ({
  sessions: [],
  historyLoaded: false,
  historyAppId: null,
  activeSessionId: null,
  messages: [],
  status: 'idle',
  error: null,
  pendingApproval: null,

  beginTurn: (text, attachments = []) => {
    const assistantId = createId()
    // 文本在前、附件在后：与用户「先写话、再补附件」的输入顺序一致
    const parts: AiMessagePart[] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...attachments.map(
        (attachment): AiMessagePart => ({ type: 'attachment', ...attachment }),
      ),
    ]
    set((state) => ({
      status: 'streaming',
      error: null,
      messages: [
        ...state.messages,
        { id: createId(), role: 'user', parts },
        { id: assistantId, role: 'assistant', parts: [] },
      ],
    }))
    return assistantId
  },

  applyEvent: (assistantId, event) => {
    set((state) => {
      const patch = (updater: (parts: AiMessagePart[]) => AiMessagePart[]) => ({
        messages: state.messages.map((message) =>
          message.id === assistantId
            ? { ...message, parts: updater(message.parts) }
            : message,
        ),
      })

      switch (event.type) {
        case 'text':
          return patch((parts) => appendText(parts, event.text))

        case 'tool-call':
          return patch((parts) => [
            ...parts,
            {
              type: 'tool-call',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
              state: 'running',
            },
          ])

        case 'tool-result':
          return patch((parts) =>
            patchToolCall(parts, event.toolCallId, {
              state: 'done',
              output: event.output,
            }),
          )

        case 'tool-error':
          return patch((parts) =>
            patchToolCall(parts, event.toolCallId, {
              state: 'error',
              error: describeUnknown(event.error),
            }),
          )

        case 'error':
          return { error: describeUnknown(event.error) }

        case 'finish':
          return { status: 'idle' }

        default:
          return {}
      }
    })
  },

  endTurn: () => set({ status: 'idle' }),

  failTurn: (message) =>
    set((state) => ({
      status: 'error',
      error: message,
      // 失败时把审批卡一起收掉：这一轮已经结束了，留着它点也没用
      pendingApproval: null,
      // 失败时把最后一条助手消息里的「执行中」工具标记为失败，
      // 否则 UI 上会永远转圈
      messages: state.messages.map((item) =>
        item.role === 'assistant'
          ? {
              ...item,
              parts: item.parts.map((part) =>
                part.type === 'tool-call' && part.state === 'running'
                  ? { ...part, state: 'error' as const, error: message }
                  : part,
              ),
            }
          : item,
      ),
    })),

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  clearPendingApproval: () => set({ pendingApproval: null }),

  persist: async () => {
    const { messages, activeSessionId, sessions } = get()
    if (messages.length === 0) return

    const appId = getAppScope()
    const now = Date.now()
    const existing = sessions.find((item) => item.id === activeSessionId)
    const id = existing?.id ?? createId()
    // 标题只在会话第一次落盘时定：之后用户消息再多，也还是「第一条」那个标题
    const title = existing?.title ?? deriveSessionTitle(messages)

    const summary: AiSessionSummary = {
      id,
      appId,
      title,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await saveSession({ ...summary, messages })

    set((state) => ({
      activeSessionId: id,
      sessions: [summary, ...state.sessions.filter((item) => item.id !== id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    }))

    // 新建的会话要记住它是当前会话，下次打开面板能直接续上
    if (!existing) void setActiveSessionId(appId, id)
  },

  loadHistory: async (options) => {
    const appId = getAppScope()
    const current = get()

    /*
      同一个 app 已经加载过就直接返回：`AiPanel` 关闭时会整体卸载，再打开是一次重挂载，
      这里若照常往下走，就会用 IDB 里的旧版本把「流式回复已经吐出来的增量」覆盖掉。
      真正的重新加载只发生在**切 app**（`historyAppId` 与当前作用域不一致）。
    */
    if (current.historyLoaded && current.historyAppId === appId) return

    // 切 app 时先清干净，避免上一个 app 的会话串进来
    set({
      historyLoaded: false,
      historyAppId: appId,
      sessions: [],
      activeSessionId: null,
      messages: [],
      status: 'idle',
      error: null,
      pendingApproval: null,
    })

    const sessions = await listSessions(appId)

    /*
      「刷新后新会话」：列表照常加载（选择器要有历史可翻），但**不恢复**上次那段，
      直接停在空的新会话上。这里必须放在 `await` 之后 —— 提前 return 会把恢复逻辑漏掉。
    */
    if (options?.fresh) {
      set({ sessions, historyLoaded: true })
      return
    }

    const remembered = await getActiveSessionId(appId)

    // 记忆里的会话可能已被删除：回落到最近更新的一条
    const active = sessions.find((item) => item.id === remembered) ?? sessions[0] ?? null

    if (!active) {
      set({ sessions, historyLoaded: true })
      return
    }

    const messages = await getSessionMessages(active.id)
    set({
      sessions,
      activeSessionId: active.id,
      messages,
      historyLoaded: true,
    })
  },

  startNewSession: () => {
    set({
      activeSessionId: null,
      messages: [],
      status: 'idle',
      error: null,
      pendingApproval: null,
    })
    void setActiveSessionId(getAppScope(), null)
  },

  switchSession: async (sessionId) => {
    const appId = getAppScope()
    const messages = await getSessionMessages(sessionId)
    set({
      activeSessionId: sessionId,
      messages,
      status: 'idle',
      error: null,
      pendingApproval: null,
    })
    void setActiveSessionId(appId, sessionId)
  },

  hasSession: async (sessionId) => {
    const sessions = await listSessions(getAppScope())
    return sessions.some((item) => item.id === sessionId)
  },

  removeSession: async (sessionId) => {
    const appId = getAppScope()
    clearSessionGrants(sessionId)
    await deleteSessionFromDb(sessionId, appId)
    const sessions = await listSessions(appId)

    if (get().activeSessionId !== sessionId) {
      set({ sessions })
      return
    }

    // 删掉的正是当前会话：切到最近一条；一条不剩就回到「新对话」状态
    const next = sessions[0] ?? null
    const messages = next ? await getSessionMessages(next.id) : []
    set({
      sessions,
      activeSessionId: next?.id ?? null,
      messages,
      status: 'idle',
      error: null,
      pendingApproval: null,
    })
    void setActiveSessionId(appId, next?.id ?? null)
  },
}))
