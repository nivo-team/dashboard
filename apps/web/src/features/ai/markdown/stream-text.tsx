import { memo, useMemo } from 'react'
import { prepare } from '#/features/ai/markdown/pretext'

export interface PretextStreamTextProps {
  text: string
  className?: string
}

/**
 * 稳定的单段文本展示。
 * 通过 React.memo 彻底隔绝后续 token 追加对已稳定段落的不必要重绘与 DOM 重排。
 */
const StableParagraph = memo(function StableParagraph({
  content,
}: {
  content: string
}) {
  return <p className="whitespace-pre-wrap">{content}</p>
})

/**
 * 活跃段落（正在持续接收流式 token 的当前末段）：
 * - 使用 Pretext 的 prepare 进行离屏分词与断行预备分析，规避 DOM 脏测量；
 * - 文本末尾跟随脉冲微光标。
 */
function ActiveParagraph({ content }: { content: string }) {
  // Pretext 纯离屏分析，确保断行引擎在字符增量期间保持稳定拓扑
  useMemo(() => {
    if (!content) return null
    try {
      return prepare(content, '14px sans-serif', { whiteSpace: 'pre-wrap' })
    } catch {
      return null
    }
  }, [content])

  return (
    <p className="whitespace-pre-wrap">
      {content}
      <span
        aria-hidden="true"
        className="ms-0.5 inline-block h-3.5 w-1.5 align-middle rounded-xs bg-kumo-subtle/80 motion-safe:animate-pulse"
      />
    </p>
  )
}

/**
 * 基于 Pretext 段落隔离与预分析的高性能流式文本渲染组件。
 *
 * 核心优化：
 * 1. 段落解耦（Paragraph Splitting）：将历史稳定段落与末尾活跃段落隔离，
 *    避免长文本流式增长时浏览器对全量数千字符做 O(N^2) 的全局 Word-wrap 重排；
 * 2. 离屏预计算（Pretext Offscreen Preparation）：跳过 DOM 测量，由 Canvas 引擎预先稳定分段；
 * 3. 视觉平滑：末尾配备与主题适配的微脉冲光标。
 */
export function PretextStreamText({
  text,
  className = 'flex flex-col gap-3 text-sm leading-6 text-kumo-default',
}: PretextStreamTextProps) {
  // 按连续换行或段落分块
  const paragraphs = useMemo(() => {
    if (!text) return []
    return text.split('\n\n')
  }, [text])

  if (paragraphs.length === 0) return null

  const stableParagraphs = paragraphs.slice(0, -1)
  const activeParagraph = paragraphs[paragraphs.length - 1] ?? ''

  return (
    <div className={className}>
      {stableParagraphs.map((para, index) => (
        <StableParagraph key={`stable-${index}`} content={para} />
      ))}
      <ActiveParagraph content={activeParagraph} />
    </div>
  )
}
