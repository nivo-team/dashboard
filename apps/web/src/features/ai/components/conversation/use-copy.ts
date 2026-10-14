import { useCallback, useEffect, useRef, useState } from 'react'

/** 复制成功反馈保持多久 */
const COPIED_FEEDBACK_MS = 1500

/**
 * 文本一键复制 Hook，1500ms 内展示已复制反馈。
 *
 * 剪贴板不可用（`navigator.clipboard` 缺席、或非安全上下文被拒）时**静默降级** ——
 * 复制是个附加动作，为它弹一个报错比复制失败本身更打扰。
 */
export function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    } catch {
      // 剪贴板不可用时静默降级
    }
  }, [text])

  return { copied, copy }
}
