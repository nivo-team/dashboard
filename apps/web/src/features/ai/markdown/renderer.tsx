import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 助手回复的 Markdown 渲染。
 *
 * **这个文件是懒加载的目标**（见 `#/features/ai/markdown/content`）：`react-markdown` +
 * `remark-gfm` 加起来几十 KB，而 AI 面板挂在 `AppShell` 上 —— 静态引入会直接进主 bundle。
 * 默认导出是给 `lazy()` 用的。
 *
 * 三条安全约定：
 * - **不渲染原始 HTML**：`react-markdown` 默认就把 HTML 当文本（要渲染得显式加 `rehype-raw`），
 *   这正是我们要的 —— AI 的输出属于不可信内容；
 * - **链接一律外链 + `noopener`**：AI 给的地址是外部的，不该走 SPA 路由，
 *   也不能让它通过 `window.opener` 反向操作本页；危险协议（`javascript:` 等）由
 *   `react-markdown` 的默认 `urlTransform` 拦掉；
 * - **图片不带头**：`referrerPolicy="no-referrer"` + `loading="lazy"`，
 *   别把当前页地址泄露给第三方图床。
 *
 * 样式全部走 Kumo 语义令牌，并遵守仓库规范：正文 14px、标题用 `font-semibold`、
 * 强调用 `font-medium`（**不用 `font-bold`**）、间距用逻辑属性（`ps-*` / `me-*`）以适配 RTL。
 */
export default function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div className="text-sm leading-6 text-kumo-default [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,

          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h6>
          ),

          ul: ({ children }) => (
            <ul className="my-2 flex list-disc flex-col gap-1 ps-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 flex list-decimal flex-col gap-1 ps-5">{children}</ol>
          ),
          // 列表项里的段落由 markdown 生成，会把间距顶开，这里压掉
          li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-kumo-link underline underline-offset-2 hover:text-kumo-strong"
            >
              {children}
            </a>
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-2 border-s-2 border-kumo-line ps-3 text-kumo-subtle">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="my-3 border-kumo-line" />,

          strong: ({ children }) => (
            <strong className="font-medium">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => (
            <del className="text-kumo-subtle line-through">{children}</del>
          ),

          /*
            代码块与行内代码共用 `code` 渲染器（v9 起没有了 `inline` prop），
            所以这里先按「行内代码」给样式，再由 `pre` 用后代选择器把背景与内边距清掉 ——
            `[&>code]` 生成的选择器特异性高于 `.bg-kumo-tint`，覆盖是确定的。
            刻意不做语法高亮：AI 输出的代码片段短，为它引 shiki（Kumo CodeBlock 的依赖）
            不值这个体积。
          */
          code: ({ children }) => (
            <code className="rounded bg-kumo-tint px-1 py-0.5 font-mono text-[0.8125rem]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-kumo-tint p-3 font-mono text-[0.8125rem] leading-5 [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </pre>
          ),

          // 窄面板放不下宽表格：外层给横向滚动，别让整块内容被撑破
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-kumo-line bg-kumo-tint px-2 py-1 text-start font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-kumo-line px-2 py-1 text-start align-top">
              {children}
            </td>
          ),

          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ''}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="my-2 max-w-full rounded-lg"
            />
          ),

          // GFM 任务列表：[x] / [ ] 渲染成只读复选框
          input: ({ checked }) => (
            <input
              type="checkbox"
              checked={Boolean(checked)}
              disabled
              readOnly
              className="me-1 align-middle"
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
