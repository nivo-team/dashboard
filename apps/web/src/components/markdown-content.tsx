import { Suspense, lazy } from 'react'

/**
 * 助手回复的 Markdown 渲染入口。
 *
 * 两个刻意的设计：
 *
 * 1. **懒加载**：`react-markdown` + `remark-gfm` 几十 KB，而这个组件会被 `ai-panel` 静态引入、
 *    进而打进主 bundle。用 `lazy()` 把它切成独立 chunk，用户**第一次看到助手回复**时才下载；
 * 2. **流式时退回纯文本**：既省掉「每个 token 解析一遍 Markdown」的开销，也避免未闭合语法
 *    （半截的 ``` 或 `**`）让渲染结果来回跳 —— 流结束（`streaming` 转 false）再渲染 Markdown。
 *    懒加载还没就绪时同样走这条降级路径，所以首帧不会闪空白。
 */
const MarkdownRenderer = lazy(() => import('./markdown-renderer'))

export function MarkdownContent({
  text,
  streaming = false,
}: {
  text: string
  streaming?: boolean
}) {
  if (streaming) return <PlainText text={text} />

  return (
    <Suspense fallback={<PlainText text={text} />}>
      <MarkdownRenderer text={text} />
    </Suspense>
  )
}

/** 纯文本降级：流式过程中、以及 Markdown 渲染器尚未下载完成时使用。 */
function PlainText({ text }: { text: string }) {
  return (
    <p className="text-sm leading-6 whitespace-pre-wrap text-kumo-default">{text}</p>
  )
}
