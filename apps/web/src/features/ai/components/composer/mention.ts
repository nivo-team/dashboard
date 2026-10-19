import { ImageIcon } from '@phosphor-icons/react'
import type { TFunction } from 'i18next'
import { listRouteRefItems } from '#/features/ai/core'
import type { AiRouteRefItem, AiRouteRefKind } from '#/features/ai/core'

/**
 * `@` 引用：语法解析、行清单与**匹配规则**。
 *
 * 纯逻辑，没有 React —— 于是「打了 `@table-example:1234` 面板里该剩哪几行」
 * 这种事可以直接用单测钉住，不必先挂起一个真实输入框。
 *
 * 行的内容来自 `#/features/ai/core/route-refs`（名字、图标、匹配词都取自导航清单），
 * **这里不另加名单** —— 展开成路径那一步在发给模型时（`runtime.toModelMessages`）做，
 * 所以用户看到的还是自己打的那串字。
 */

/**
 * 输入里**正在打的**那个 `@…`（`@` 必须是行首或空白之后的第一个字符 —— 否则
 * `zhang@example.com` 里的 `@example` 也会被当成引用）。
 *
 * 返回的 `start` 指向 `@` 本身：选中菜单项时用它把这段替换掉。
 * `query` 允许中文与 `:`（`@示例` / `@table-example:li` 都能搜）。
 */
export function parseMentionQuery(draft: string): { query: string; start: number } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(draft)
  if (!match) return null
  return { query: match[2], start: match.index + match[1].length }
}

/**
 * 面板按 `kind` 分段的顺序 —— 与命令面板一样「名字在左、灰键在中、说明在右」，
 * 段标题把「添加到对话」和「引用某个位置」分开。**顺序只在这一个数组里**，
 * 段名走 `ai` 命名空间（各语言齐备）。
 */
export const MENTION_SECTIONS: ReadonlyArray<{
  kind: AiRouteRefKind
  labelKey: string
  fallback: string
}> = [
  { kind: 'add', labelKey: 'mentionSectionAdd', fallback: '添加' },
  { kind: 'module', labelKey: 'mentionSectionModule', fallback: '模块' },
  { kind: 'page', labelKey: 'mentionSectionPage', fallback: '页面' },
  { kind: 'record', labelKey: 'mentionSectionRecord', fallback: '记录' },
]

/**
 * `@` 面板的行：**附件入口**（沿用原来的能力，只是多了 `@` 这个入口）+ `route-refs` 里的模块。
 *
 * 每次都现算：菜单只在打 `@` 时打开，这点开销可以忽略；换成缓存反而要处理
 * 「切了应用 / 换了语言之后菜单没跟着变」的问题。
 */
export function buildMentionRows(t: TFunction): AiRouteRefItem[] {
  const attach: AiRouteRefItem = {
    id: 'attach',
    kind: 'add',
    token: '',
    syntax: '',
    name: t('addPhotoAndFiles', '添加照片和文件'),
    description: t('promptMentionAttachDesc', '从本机添加图片或 Markdown / 文本文件'),
    icon: ImageIcon,
    keywords: ['file', 'files', 'image', 'attachment', '附件', '文件', '图片'],
  }
  return [attach, ...listRouteRefItems()]
}

/**
 * 一行的匹配规则：名字 / 语法 / 说明 / 导航关键词四处都能命中
 * （所以 `@示例` 与 `@table-example` 一样好使）。
 *
 * 一处特别的兜底：`@table-example:1234` 是**合法的记录引用**，但没有任何一行的文案里
 * 含 `1234` —— 照普通规则它只会落到「没有匹配」。所以一条都没匹配上、而查询里又带着冒号时，
 * 把该模块的**记录行**留着（用户看到的是「表格示例详情」那一行），面板不闪、也不误报「没匹配上」。
 */
export function matchMentionRows(
  rows: readonly AiRouteRefItem[],
  rawQuery: string,
): AiRouteRefItem[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return [...rows]

  const matched = rows.filter(
    (row) =>
      row.name.toLowerCase().includes(query) ||
      row.syntax.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query) ||
      row.keywords.some((keyword) => keyword.toLowerCase().includes(query)),
  )
  if (matched.length > 0) return matched

  if (query.indexOf(':') <= 0) return matched
  return rows.filter((row) => row.record && query.startsWith(row.token.toLowerCase()))
}

/** 面板上的一段：段标题 + 段内行（空段在 `toMentionSections` 里就被滤掉了） */
export interface MentionSection {
  kind: AiRouteRefKind
  labelKey: string
  fallback: string
  rows: AiRouteRefItem[]
}

/**
 * 按段渲染，但**键盘游标只有一个**：↑↓ / Enter / Tab 走的是扁平序号，段标题不是可选项。
 * 所以这里只负责分段，行号由 `buildMentionRowIndex` 提供。
 */
export function toMentionSections(rows: readonly AiRouteRefItem[]): MentionSection[] {
  return MENTION_SECTIONS.map((section) => ({
    ...section,
    rows: rows.filter((row) => row.kind === section.kind),
  })).filter((section) => section.rows.length > 0)
}

/** 行 id → 扁平序号（跨段的连续编号，键盘游标用的就是它） */
export function buildMentionRowIndex(rows: readonly AiRouteRefItem[]): Map<string, number> {
  return new Map(rows.map((row, index) => [row.id, index]))
}
