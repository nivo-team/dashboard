import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  deleteComposerDraft,
  getComposerDraft,
  saveComposerDraft,
  useAiSessionStore,
} from '#/features/ai/core'
import type { AiAttachment } from '#/features/ai/core'
import { getAppScope } from '#/lib/store/app-scope'

/**
 * 输入区的**草稿**：装载、防抖落库、以及「发出去了才清」。
 *
 * 三件事原来散在 `AiComposer` 的三段 effect 里，中间夹着几十行无关逻辑，
 * 而它们共享同一个易错点 —— **装载完成之前不许回写**（`isLoadedRef`）：
 * 少了它，初次挂载的空值会在 300ms 后把上一次的草稿冲掉。收进一个 hook 后，
 * 「什么时候允许写、什么被谁清掉」只有一处可读。
 *
 * 草稿按 **appId + sessionId** 隔离（`getAppScope()`），未建会话时用独立 key。
 */

/** 打字停多久算「这一版草稿定了」 */
const DRAFT_SAVE_DELAY = 300

export interface ComposerDraft {
  value: string
  setValue: Dispatch<SetStateAction<string>>
  attachments: AiAttachment[]
  setAttachments: Dispatch<SetStateAction<AiAttachment[]>>
  /**
   * 消息真的发出去了才调：撤掉待落库的定时器，并清掉 IndexedDB 里的这一份草稿
   * （否则下次进这个会话，刚发出去的内容又回到输入框里）。
   */
  clearPersistedDraft: () => void
}

export function useComposerDraft(
  activeSessionId: string | null,
  isStreaming: boolean,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
): ComposerDraft {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const isLoadedRef = useRef(false)
  const draftTimerRef = useRef<number | null>(null)

  const draftText = useAiSessionStore((state) => state.draftText)
  const draftAttachments = useAiSessionStore((state) => state.draftAttachments)
  const setDraft = useAiSessionStore((state) => state.setDraft)

  // 消费来自 store 的草稿（回退修改或切换会话时装载到输入框中）
  useEffect(() => {
    if (draftText !== null) {
      setValue(draftText)
      setAttachments([...draftAttachments])
      setDraft(null, [])
      isLoadedRef.current = true
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [draftText, draftAttachments, setDraft, textareaRef])

  // 切换会话或初次挂载时：若当前输入框未被编辑，从 IndexedDB 读取对应会话的草稿
  useEffect(() => {
    let cancelled = false
    void getComposerDraft(getAppScope(), activeSessionId).then((draft) => {
      if (cancelled) return
      if (draft) {
        setValue(draft.text)
        setAttachments([...draft.attachments])
      }
      isLoadedRef.current = true
    })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  // 用户打字或修改附件时：防抖缓存到 IndexedDB（按 appId 与 sessionId 隔离，new session 使用独立 key）
  useEffect(() => {
    if (!isLoadedRef.current || isStreaming) return

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current)
    }

    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null
      void saveComposerDraft(getAppScope(), activeSessionId, value, attachments)
    }, DRAFT_SAVE_DELAY)

    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current)
      }
    }
  }, [value, attachments, activeSessionId, isStreaming])

  const clearPersistedDraft = () => {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    void deleteComposerDraft(getAppScope(), activeSessionId)
  }

  return { value, setValue, attachments, setAttachments, clearPersistedDraft }
}
