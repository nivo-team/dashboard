import { create } from 'zustand'
import { getAppScope } from '#/lib/store/app-scope'
import {
  deleteComposerDraft,
  deleteSession as deleteSessionFromDb,
  getActiveSessionId,
  getComposerDraft,
  getSessionMessages,
  listSessions,
  saveComposerDraft,
  saveSession,
  setActiveSessionId,
  type AiSessionSummary,
} from './session-db'
import { clearSessionGrants, resetDraftSessionScope } from './session-permissions'
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

/**
 * 一条等待用户决定的审批请求（`id` 由 `chat.ts` 生成，用来认领用户的点击）。
 *
 * `AiApprovalRequest` 是判别联合（写操作 / 跳转），所以这里用**交叉类型**而不是
 * `interface extends` —— 联合不能被 interface 继承。
 */
export type PendingApproval = AiApprovalRequest & { id: string }

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
   * 本会话内各工具的调用计数（键 = 工具名）。
   *
   * 目前只给 `check_result_match` 的限流用：它是唯一能"逐次问出原文"的工具，
   * 靠次数上限把"多次试探"的信息量压到定位不出一个值（详见 ai-tools-implementation-shape）。
   * **不落盘**，新建 / 切换会话即归零。
   */
  toolCounters: Record<string, number>

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
  /**
   * 准备重试指定的一条用户消息。
   * 重置该轮后续未成功的助手回复，将状态设为 streaming，并返回提示词与附件。
   */
  prepareRetryTurn: (userMessageId: string) => {
    text: string
    attachments: readonly AiAttachment[]
    assistantId: string
  } | null
  /**
   * 待回退的用户消息 ID（若处于回退修改记录模式）。
   * 当用户点击某条已成功的消息的「回退」按钮时设置。
   */
  rewindMessageId: string | null
  /** 外部注入给输入框的草稿文本（例如回退时回填给输入框） */
  draftText: string | null
  /** 外部注入给输入框的草稿附件 */
  draftAttachments: AiAttachment[]
  /** 设置或清空外部草稿 */
  setDraft: (text: string | null, attachments?: AiAttachment[]) => void
  /**
   * 触发回退到某条用户消息：
   * 将该消息的文本与附件回填到输入框草稿中，标记 rewindMessageId。
   */
  rollbackToMessage: (userMessageId: string) => void
  /** 取消回退状态 */
  cancelRollback: () => void
  /**
   * 执行回退截断：若存在 rewindMessageId，截断该条消息及之后的所有历史消息并重置标记
   */
  commitRewind: () => void
  /** 递增并返回某个工具的会话内调用次数（限流用） */
  bumpToolCounter: (key: string) => number
  /**
   * 认领**全屏建议卡**上的一次点击（带我去 / 不用了）。
   *
   * 与审批卡不同：建议卡**不阻塞**这一轮（工具早就返回了），所以这里只改 part 的状态
   * 并落盘 —— 刷新后卡片还在、点过的状态也还在。
   */
  resolveNavProposal: (id: string, state: 'accepted' | 'dismissed') => void
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

function finishPendingReasoning(parts: AiMessagePart[]): AiMessagePart[] {
  let changed = false
  const next = parts.map((part) => {
    if (part.type === 'reasoning' && part.state === 'streaming') {
      changed = true
      return { ...part, state: 'done' as const }
    }
    return part
  })
  return changed ? next : parts
}

function appendReasoning(parts: AiMessagePart[], text: string): AiMessagePart[] {
  const last = parts[parts.length - 1]
  if (last && last.type === 'reasoning' && last.state === 'streaming') {
    const next = parts.slice(0, -1)
    next.push({ ...last, text: last.text + text })
    return next
  }
  return [
    ...finishPendingReasoning(parts),
    { type: 'reasoning', text, state: 'streaming' },
  ]
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
  toolCounters: {},
  rewindMessageId: null,
  draftText: null,
  draftAttachments: [],

  beginTurn: (text, attachments = []) => {
    const assistantId = createId()
    const now = new Date().toISOString()
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
        {
          id: createId(),
          role: 'user',
          parts,
          createdAt: now,
          status: 'success',
        },
        {
          id: assistantId,
          role: 'assistant',
          parts: [],
          createdAt: now,
          status: 'streaming',
        },
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
          return patch((parts) => appendText(finishPendingReasoning(parts), event.text))

        case 'reasoning':
          return patch((parts) => appendReasoning(parts, event.text))

        case 'tool-call':
          return patch((parts) => [
            ...finishPendingReasoning(parts),
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

        case 'nav-proposal': {
          /*
            全屏容器里 `navigate_to` 返回的建议（运行时翻成这条事件）→ 落成一张卡片。
            它**不是**工具卡片：工具卡片默认隐藏（`aiShowDetails`），而这张卡是
            用户唯一能"去页面"的入口，必须始终可见。
          */
          const part: Extract<AiMessagePart, { type: 'nav-proposal' }> = {
            type: 'nav-proposal',
            id: createId(),
            path: event.path,
            label: event.label,
            state: 'pending',
            ...(event.reason ? { reason: event.reason } : {}),
          }
          return patch((parts) => [...finishPendingReasoning(parts), part])
        }

        case 'tool-error':
          return patch((parts) =>
            patchToolCall(parts, event.toolCallId, {
              state: 'error',
              error: describeUnknown(event.error),
            }),
          )

        case 'error': {
          const errDesc = describeUnknown(event.error)
          return {
            error: errDesc,
            messages: state.messages.map((item) =>
              item.id === assistantId
                ? { ...item, status: 'error', error: errDesc }
                : item,
            ),
          }
        }

        case 'finish':
          return {
            status: 'idle',
            messages: state.messages.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    status: 'success',
                    createdAt: new Date().toISOString(),
                    parts: finishPendingReasoning(item.parts),
                    // 只在真有用量时写，别给消息塞一个 `undefined`
                    ...(event.usage ? { usage: event.usage } : {}),
                  }
                : item,
            ),
          }

        default:
          return {}
      }
    })
  },

  endTurn: () => {
    void deleteComposerDraft(getAppScope(), get().activeSessionId)
    set((state) => ({
      status: 'idle',
      messages: state.messages.map((item) =>
        item.role === 'assistant'
          ? {
              ...item,
              status: item.status === 'streaming' ? 'success' : item.status,
              parts: finishPendingReasoning(item.parts),
            }
          : item,
      ),
    }))
  },

  failTurn: (message) =>
    set((state) => {
      let lastAssistantIndex = -1
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i]?.role === 'assistant') {
          lastAssistantIndex = i
          break
        }
      }

      let failedText = ''
      let failedAttachments: AiAttachment[] = []
      if (lastAssistantIndex > 0 && state.messages[lastAssistantIndex - 1]?.role === 'user') {
        const userMsg = state.messages[lastAssistantIndex - 1]
        const textPart = userMsg.parts.find((p) => p.type === 'text')
        failedText = textPart && textPart.type === 'text' ? textPart.text : ''
        failedAttachments = userMsg.parts
          .filter(
            (p): p is Extract<AiMessagePart, { type: 'attachment' }> =>
              p.type === 'attachment',
          )
          .map((p) => {
            const { type: _type, ...att } = p
            return att as unknown as AiAttachment
          })
      }

      // 失败时不留下半截失败的 user 与 assistant 消息，不出现带 bot 头像的错误助手卡片
      const newMessages =
        lastAssistantIndex > 0
          ? state.messages.slice(0, lastAssistantIndex - 1)
          : state.messages.filter((_, index) => index !== lastAssistantIndex)

      const isResetToNew = newMessages.length === 0
      const currentActiveId = isResetToNew ? null : state.activeSessionId

      // 失败的提示词与附件自动回退到输入框，并持久化到 IndexedDB 草稿（按 session 隔离，新会话独立保存）
      if (failedText || failedAttachments.length > 0) {
        void saveComposerDraft(
          getAppScope(),
          currentActiveId,
          failedText,
          failedAttachments,
        )
      }

      // 若整个会话已无任何消息，从数据库清理可能残留的空会话记录与活跃指向
      if (isResetToNew && state.activeSessionId) {
        void deleteSessionFromDb(state.activeSessionId, getAppScope())
        void setActiveSessionId(getAppScope(), null)
      }

      return {
        status: 'error',
        error: message,
        // 失败时把审批卡一起收掉
        pendingApproval: null,
        activeSessionId: currentActiveId,
        sessions:
          isResetToNew && state.activeSessionId
            ? state.sessions.filter((s) => s.id !== state.activeSessionId)
            : state.sessions,
        messages: newMessages,
        draftText: failedText || state.draftText,
        draftAttachments:
          failedAttachments.length > 0 ? failedAttachments : state.draftAttachments,
      }
    }),

  prepareRetryTurn: (userMessageId) => {
    const { messages } = get()
    const targetIndex = messages.findIndex(
      (m) => m.id === userMessageId && m.role === 'user',
    )
    if (targetIndex === -1) return null

    const targetMsg = messages[targetIndex]
    if (!targetMsg) return null

    const textPart = targetMsg.parts.find((p) => p.type === 'text')
    const text = textPart && textPart.type === 'text' ? textPart.text : ''
    const attachments: AiAttachment[] = targetMsg.parts
      .filter(
        (p): p is Extract<AiMessagePart, { type: 'attachment' }> =>
          p.type === 'attachment',
      )
      .map((p) => {
        const { type: _type, ...att } = p
        return att as unknown as AiAttachment
      })

    const assistantId = createId()
    const now = new Date().toISOString()
    const newAssistantMsg: AiMessage = {
      id: assistantId,
      role: 'assistant',
      parts: [],
      createdAt: now,
      status: 'streaming',
    }

    const updatedUserMsg: AiMessage = {
      ...targetMsg,
      status: 'success',
      error: undefined,
    }

    const nextMsg = messages[targetIndex + 1]
    const newMessages = [...messages]
    newMessages[targetIndex] = updatedUserMsg

    if (nextMsg && nextMsg.role === 'assistant') {
      newMessages[targetIndex + 1] = newAssistantMsg
    } else {
      newMessages.splice(targetIndex + 1, 0, newAssistantMsg)
    }

    set({
      status: 'streaming',
      error: null,
      pendingApproval: null,
      messages: newMessages,
    })

    return { text, attachments, assistantId }
  },

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  clearPendingApproval: () => set({ pendingApproval: null }),

  setDraft: (text, attachments = []) =>
    set({ draftText: text, draftAttachments: [...attachments] }),

  rollbackToMessage: (userMessageId) => {
    const { messages } = get()
    const target = messages.find((m) => m.id === userMessageId && m.role === 'user')
    if (!target) return

    const textPart = target.parts.find((p) => p.type === 'text')
    const text = textPart && textPart.type === 'text' ? textPart.text : ''
    const attachments: AiAttachment[] = target.parts
      .filter(
        (p): p is Extract<AiMessagePart, { type: 'attachment' }> =>
          p.type === 'attachment',
      )
      .map((p) => {
        const { type: _type, ...att } = p
        return att as unknown as AiAttachment
      })

    set({
      rewindMessageId: userMessageId,
      draftText: text,
      draftAttachments: attachments,
    })
  },

  cancelRollback: () =>
    set({
      rewindMessageId: null,
      draftText: null,
      draftAttachments: [],
    }),

  commitRewind: () => {
    const { rewindMessageId, messages } = get()
    if (!rewindMessageId) return
    const index = messages.findIndex((m) => m.id === rewindMessageId)
    if (index !== -1) {
      set({
        messages: messages.slice(0, index),
        rewindMessageId: null,
      })
    } else {
      set({ rewindMessageId: null })
    }
  },

  bumpToolCounter: (key) => {
    const next = (get().toolCounters[key] ?? 0) + 1
    set((state) => ({ toolCounters: { ...state.toolCounters, [key]: next } }))
    return next
  },

  resolveNavProposal: (id, state) => {
    const has = (parts: AiMessagePart[]) =>
      parts.some((part) => part.type === 'nav-proposal' && part.id === id)
    if (!get().messages.some((message) => has(message.parts))) return

    // 内层回调参数**必须**改名：它一旦也叫 `state`，下面 `{ ...part, state }`
    // 写进去的就是整份 session 状态，而不是调用方传进来的目标状态（accepted/dismissed）。
    set((session) => ({
      messages: session.messages.map((message) =>
        has(message.parts)
          ? {
              ...message,
              parts: message.parts.map((part) =>
                part.type === 'nav-proposal' && part.id === id
                  ? { ...part, state }
                  : part,
              ),
            }
          : message,
      ),
    }))
    // 卡片状态也在存档里（刷新后点过的状态不该变回"待决定"）
    void get().persist()
  },

  persist: async () => {
    const { messages, activeSessionId, sessions } = get()
    const appId = getAppScope()

    if (messages.length === 0) {
      if (activeSessionId) {
        await deleteSessionFromDb(activeSessionId, appId)
        set((state) => ({
          activeSessionId: null,
          sessions: state.sessions.filter((item) => item.id !== activeSessionId),
        }))
      }
      return
    }

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
      void getComposerDraft(appId, null).then((draft) => {
        if (draft && get().activeSessionId === null) {
          set({ draftText: draft.text, draftAttachments: draft.attachments })
        }
      })
      return
    }

    const remembered = await getActiveSessionId(appId)

    // 记忆里的会话可能已被删除：回落到最近更新的一条
    const active = sessions.find((item) => item.id === remembered) ?? sessions[0] ?? null

    if (!active) {
      set({ sessions, historyLoaded: true })
      void getComposerDraft(appId, null).then((draft) => {
        if (draft && get().activeSessionId === null) {
          set({ draftText: draft.text, draftAttachments: draft.attachments })
        }
      })
      return
    }

    const messages = await getSessionMessages(active.id)
    set({
      sessions,
      activeSessionId: active.id,
      messages,
      historyLoaded: true,
    })
    void getComposerDraft(appId, active.id).then((draft) => {
      if (draft && get().activeSessionId === active.id) {
        set({ draftText: draft.text, draftAttachments: draft.attachments })
      }
    })
  },

  startNewSession: () => {
    const appId = getAppScope()
    // 每次新开会话，彻底重置草稿权限作用域，与上一个会话权限完全隔离
    resetDraftSessionScope()
    set({
      activeSessionId: null,
      messages: [],
      status: 'idle',
      error: null,
      pendingApproval: null,
      rewindMessageId: null,
      draftText: null,
      draftAttachments: [],
      // 新会话 = 新的限流窗口
      toolCounters: {},
    })
    void setActiveSessionId(appId, null)
    void getComposerDraft(appId, null).then((draft) => {
      if (get().activeSessionId === null) {
        set({
          draftText: draft?.text ?? '',
          draftAttachments: draft?.attachments ?? [],
        })
      }
    })
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
      rewindMessageId: null,
      draftText: null,
      draftAttachments: [],
      // 换会话 = 新的限流窗口
      toolCounters: {},
    })
    void setActiveSessionId(appId, sessionId)
    void getComposerDraft(appId, sessionId).then((draft) => {
      if (get().activeSessionId === sessionId) {
        set({
          draftText: draft?.text ?? '',
          draftAttachments: draft?.attachments ?? [],
        })
      }
    })
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
      // 删掉当前会话后切到别的会话 = 新的限流窗口
      toolCounters: {},
    })
    void setActiveSessionId(appId, next?.id ?? null)
  },
}))
