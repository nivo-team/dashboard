#!/usr/bin/env node
/**
 * 组装 agent 的提示词 —— 安全边界都在这一个文件里。
 *
 * 为什么不让 workflow 直接用 shell 拼：
 * **issue 正文与评论都是不可信的**（任何能评论的人都能写）。把它们插进 shell
 * 等于把命令注入的口子开到 PR 上（`$(...)`、反引号、`;` 都能逃逸）。
 * 这里全程走 Node 的字符串替换与 writeFile，**不经过 shell**。
 *
 * 用法：
 *   node build-prompt.mjs <模板路径> <issue.json 路径> <输出路径>
 *
 * issue.json 来自 `gh issue view <N> --json title,body,number,labels,comments`。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [templatePath, issuePath, outPath] = process.argv.slice(2)

if (!templatePath || !issuePath || !outPath) {
  console.error('用法: node build-prompt.mjs <模板路径> <issue.json 路径> <输出路径>')
  process.exit(2)
}

const template = readFileSync(templatePath, 'utf8')
const issue = JSON.parse(readFileSync(issuePath, 'utf8'))

const title = String(issue.title ?? '').trim()
const number = issue.number ?? ''

if (!title) {
  console.error('::error::issue 标题为空，无法组装提示词')
  process.exit(1)
}

/**
 * AI 自己发的评论都带这个标记。两个用途：
 * 1. 组装上下文时标注「这条是 AI 上轮说的」，让人与 AI 的话分得清；
 * 2. workflow 用它**排除自触发** —— AI 的评论作者是 PAT 背后的真人账号，
 *    光靠 `user.type != 'Bot'` 挡不住。
 */
const AI_MARKER = '<!-- ai-agent -->'

/**
 * 长度上限：过长会挤掉模型读代码的预算。截断时必须**明确告知**，
 * 与本仓 `truncatePayload` 的约定一致。
 */
const MAX_BODY = 20000
const MAX_COMMENT_CHARS = 3000
/** 只保留最近这些条评论：更早的讨论通常已被后续结论覆盖。 */
const MAX_COMMENTS = 20

const truncate = (text, limit) => {
  const value = String(text ?? '').trim()
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: value.slice(0, limit), truncated: true }
}

// ---------------------------------------------------------------- 原始需求（正文）

const bodyPart = truncate(issue.body, MAX_BODY)

// ---------------------------------------------------------------- 讨论历史（评论）

const comments = Array.isArray(issue.comments) ? issue.comments : []
const kept = comments.slice(-MAX_COMMENTS)
const dropped = comments.length - kept.length

const threadLines = []
if (dropped > 0) {
  threadLines.push(`> （更早的 ${dropped} 条评论已省略，只保留最近 ${kept.length} 条）`, '')
}

kept.forEach((comment, index) => {
  const raw = String(comment.body ?? '')
  const isAi = raw.includes(AI_MARKER)
  // 去掉标记本身，别让它污染给模型看的内容
  const cleaned = raw.split(AI_MARKER).join('').trim()
  const piece = truncate(cleaned, MAX_COMMENT_CHARS)
  const who = comment.author?.login ? `@${comment.author.login}` : '(未知作者)'
  const when = String(comment.createdAt ?? '').replace('T', ' ').slice(0, 16)

  threadLines.push(
    '---',
    `**#${dropped + index + 1} ${who}** · ${when} · ${isAi ? 'AI 助手' : '人'}`,
    '',
    piece.text || '(空评论)',
    piece.truncated ? `> ⚠️ 该评论超过 ${MAX_COMMENT_CHARS} 字符已截断。` : '',
    '',
  )
})

const thread = threadLines.length
  ? threadLines.join('\n').trim()
  : '（这个 issue 还没有评论 —— 本次是首次实现，需求就是上面那份正文。）'

// ---------------------------------------------------------------- 组装

// 模板里的占位符各自独占一行，用 split/join 避免 replace 的 `$&` 等特殊序列被解释
const output = template
  .split('<<<ISSUE_TITLE>>>')
  .join(title)
  .split('<<<ISSUE_BODY>>>')
  .join(bodyPart.text)
  .split('<<<ISSUE_THREAD>>>')
  .join(thread)

// 兜底断言：占位符必须已被全部替换，否则提示词里会残留一块没人管的占位文本
const leftover = output.match(/<<<[A-Z_]+>>>/g)
if (leftover) {
  console.error(`::error::模板里还有未替换的占位符: ${[...new Set(leftover)].join(', ')}`)
  process.exit(1)
}

writeFileSync(outPath, output, 'utf8')
console.log(
  `提示词已生成: ${outPath}（${output.length} 字符；正文截断=${bodyPart.truncated}；` +
    `评论 ${kept.length}/${comments.length} 条）`,
)
