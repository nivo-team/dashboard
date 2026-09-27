import { Badge } from '@cloudflare/kumo'

/**
 * 「测试中」标记：贴在还没定型的入口旁边（当前是 AI 相关的那几处）。
 *
 * 文案**硬编码 "Beta" 不翻译** —— 它与「Ask AI」同类，是产品术语：各语言里都写作
 * Beta，翻成「测试版」反而像另一个东西，也会让截图与文档对不上。
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <Badge variant="neutral" className={className}>
      Beta
    </Badge>
  )
}
