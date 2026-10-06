import { Suspense, lazy } from 'react'
import { PretextStreamText } from './stream-text'

/**
 * 助手回复的 Markdown 渲染入口。
 *
 * 核心设计：
 * 1. **懒加载**：`react-markdown` + `remark-gfm` 几十 KB，而这个组件会被 `ai-panel` 静态引入、
 *    进而打进主 bundle。用 `lazy()` 把它切成独立 chunk，用户**第一次看到助手回复**时才下载；
 * 2. **流式时采用 PretextStreamText**：既省掉「每个 token 解析一遍 Markdown」的开销，
 *    也利用 Pretext 的段落隔离与离屏预计算，避免长文本随 token 增长引发的 O(N^2) 全局 Word-wrap 重排；
 * 3. 流结束（`streaming` 转 false）再平滑过渡渲染 Markdown。
 */
const MarkdownRenderer = lazy(() => import('./renderer'))

export function MarkdownContent({
  text,
  streaming = false,
}: {
  text: string
  streaming?: boolean
}) {
  if (streaming) return <PretextStreamText text={text} />

  return (
    <Suspense fallback={<PretextStreamText text={text} />}>
      <MarkdownRenderer text={text} />
    </Suspense>
  )
}
