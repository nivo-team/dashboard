import { cn } from '@cloudflare/kumo'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 可一键复制的行内文本块。
 *
 * 视觉是一枚「代码块」样式的按钮：`bg-kumo-tint` 底、等宽字体，hover 时底色变 `bg-kumo-fill`、
 * 图标从 `text-kumo-subtle` 提亮到 `text-kumo-default`；点击复制后图标短暂变为对勾，
 * 并通过 `role="status"` 的隐藏文本给屏幕阅读器播报，不额外弹 toast。
 *
 * 相比 Kumo 的 `ClipboardText`：那个是「输入框形态」的整块字段（默认 lg 尺寸），
 * 放在对话框的一句话中间会偏重；这里只是一个行内按钮，尺寸由调用方控制。
 */

interface CopyableValueProps {
  /** 展示并复制的文本。 */
  text: string
  /** 无障碍描述；缺省用 `clipboard.copyAria` 模板插值 text。 */
  ariaLabel?: string
  className?: string
}

export function CopyableValue({ text, ariaLabel, className }: CopyableValueProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)

      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用（非安全上下文等）时静默降级：文本本身仍可手动选中复制
    }
  }, [text])

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy()
      }}
      aria-label={
        ariaLabel ?? t('clipboard.copyAria', '复制 {{text}} 到剪贴板', { text })
      }
      className={cn(
        'group inline-flex max-w-full items-center rounded-md bg-kumo-tint px-2 py-1',
        'font-mono text-sm font-semibold hover:cursor-pointer hover:bg-kumo-fill',
        className,
      )}
    >
      {text}
      {copied ? (
        <CheckIcon
          size={12}
          weight="bold"
          className="ms-1.5 inline shrink-0 text-kumo-success"
        />
      ) : (
        <CopyIcon
          size={12}
          className="ms-1.5 inline shrink-0 text-kumo-subtle group-hover:text-kumo-default"
        />
      )}
      <span className="sr-only" role="status">
        {copied ? t('clipboard.copied', '已复制') : ''}
      </span>
    </button>
  )
}
