/**
 * 源码键扫描：把代码里真实用到的 i18n 键抽出来。
 *
 * 为什么需要它：门控脚本只看 JSON 文件之间的键树一致性，**看不到代码**。
 * 于是「代码里写了 `t('users:notExist')` 但语言文件里没有」这种错，
 * 直到用户界面上显示出一串键名才被发现。这个扫描器把这类错误提前到 CI。
 *
 * 三种来源：
 * 1. `t('key')` / `t('ns:key')` —— 含 `t(\`prefix.${expr}\`)` 动态键；
 * 2. `<Trans i18nKey="..." ns="..." />`；
 * 3. `useTranslation('ns')` —— 用于把该文件里的无命名空间键归属到 ns。
 *
 * 扫描是**文本级**的（用正则 + 括号配对），不做 AST。理由：本仓没有 ESLint、
 * 也没装 TypeScript 编译器 API 的脚本侧依赖，引入 AST 会把工具链复杂化；
 * 而 `t(` 的调用形态在本仓高度一致，误报由白名单与人工确认兜底。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './config.mjs'

/** 递归收集源码文件。 */
export function collectSourceFiles(dir = join(ROOT, 'apps/web/src')) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      if (entry.name.endsWith('.gen.ts')) continue
      if (statSync(full).size > 512 * 1024) continue
      out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * 从 `t(` 的下标开始，取出第一个参数的字符串字面量（含模板字面量前缀）。
 * 返回 { raw, dynamic, end }；`dynamic` 表示含 `${}`。
 */
function readFirstArg(text, openParen) {
  let i = openParen + 1
  while (i < text.length && /\s/.test(text[i])) i += 1
  const quote = text[i]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null

  let out = ''
  let dynamic = false
  i += 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      out += text[i + 1] ?? ''
      i += 2
      continue
    }
    if (ch === quote) return { raw: out, dynamic, end: i }
    if (quote === '`' && ch === '$' && text[i + 1] === '{') {
      // 动态键：记录标记，跳过整个 ${...}，继续读到真正的闭合反引号
      dynamic = true
      let depth = 1
      i += 2
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth += 1
        else if (text[i] === '}') depth -= 1
        i += 1
      }
      out += '${}'
      continue
    }
    out += ch
    i += 1
  }
  return null
}

/**
 * 读取 `t(` 的完整参数区（到配对的 `)`），用于解析第二个参数里的 `ns:`。
 * 只做括号计数，不解析表达式 —— 够用且不会误伤字符串里的括号（这里刻意忽略
 * 字符串内的括号，代价是极端情况下会多读一点，但 `ns:` 的提取仍准确）。
 */
function readArgsBlock(text, openParen) {
  let depth = 0
  let i = openParen
  while (i < text.length && i - openParen < 2000) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return text.slice(openParen + 1, i)
    }
    i += 1
  }
  return text.slice(openParen + 1, Math.min(text.length, openParen + 400))
}

/** 从参数区里抽 `ns: 'xxx'`（i18next 的 options.ns）。 */
function readNsOption(argsBlock) {
  const match = argsBlock.match(/\bns:\s*['"]([a-zA-Z][\w-]*)['"]/)
  return match ? match[1] : null
}

/**
 * 解析 `useTranslation` 的解构绑定，返回 `{ n: 函数名, path: 所在键路径 }`。
 *
 * 要覆盖三种真实写法：
 * - `const { t } = useTranslation('ai')`
 * - `const { t: tc } = useTranslation()`          ← 重命名，函数名是 `tc` 不是 `t`
 * - `const { i18n: { t: t2 } } = useTranslation()` ← 嵌套
 *
 * 早期版本用一条正则取「冒号前的标识符」，把 `t: tc` 解析成了 `t`，
 * 导致 `tc(...)` 的键被错误归属到另一个命名空间。
 */
function parseBindings(body) {
  const out = []
  const stack = [{ n: '' }]
  let i = 0

  while (i < body.length) {
    const ch = body[i]

    if (ch === ',') {
      i += 1
      continue
    }
    if (ch === '{') {
      // 进入嵌套层；层名取上一个已解析出的标识符（如 i18n）
      const last = out[out.length - 1]
      stack.push({ n: last ? last.n : '' })
      i += 1
      continue
    }
    if (ch === '}') {
      stack.pop()
      i += 1
      continue
    }
    if (!/[A-Za-z_$]/.test(ch)) {
      i += 1
      continue
    }

    const start = i
    while (i < body.length && /[\w$]/.test(body[i])) i += 1
    const ident = body.slice(start, i)

    // 跳过空白，看是不是 `ident: alias`
    let j = i
    while (j < body.length && /\s/.test(body[j])) j += 1

    if (body[j] === ':') {
      let k = j + 1
      while (k < body.length && /\s/.test(body[k])) k += 1
      if (body[k] === '{') {
        // 嵌套：ident 作为层名压栈（由后续 `{` 分支复用）——这里先记下
        out.push({
          n: ident,
          path: stack
            .map((s) => s.n)
            .filter(Boolean)
            .join('.'),
        })
        continue
      }
      const aStart = k
      while (k < body.length && /[\w$]/.test(body[k])) k += 1
      const alias = body.slice(aStart, k)
      if (alias) {
        out.push({
          n: alias,
          path: stack
            .map((s) => s.n)
            .filter(Boolean)
            .join('.'),
        })
        i = k
      }
      continue
    }

    out.push({
      n: ident,
      path: stack
        .map((s) => s.n)
        .filter(Boolean)
        .join('.'),
    })
  }

  return out
}

/**
 * 收集注释区间 [start, end)。
 *
 * 为什么必须做：代码注释里经常拿 `t('actions.cancel', '取消')` 当反例讲解 ——
 * 那是**注释不是调用**。不排除它就会报出一个永远修不掉的假缺失。
 */
function collectCommentRanges(text) {
  const ranges = []
  let i = 0
  let quote = null

  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    if (quote) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      if (quote === '`' && ch === '$' && next === '{') {
        // 模板字面量里的表达式：退出字面量状态继续扫描
        quote = null
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      let end = text.indexOf('\n', i)
      if (end === -1) end = text.length
      ranges.push([i, end])
      i = end
      continue
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      ranges.push([i, stop])
      i = stop
      continue
    }
    i += 1
  }

  return ranges
}

function inRanges(ranges, pos) {
  return ranges.some(([start, end]) => pos >= start && pos < end)
}

/** 抽取一个文件里的所有键引用。 */
export function scanFile(file, config) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  const commentRanges = collectCommentRanges(text)

  /**
   * 该文件里的翻译函数名 → 命名空间。
   *
   * 一个文件可以有多份翻译函数，各自绑不同命名空间 —— 例如
   * `useTranslation('ai')` 给出 `t`、`useTranslation()` 给出 `tc`。
   * 只认字面量 `t(` 会把 `tc(...)` 整段漏掉，并把它错误归属到第一个命名空间。
   */
  const fnNs = new Map()
  const fnNames = []

  for (const match of text.matchAll(
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*useTranslation\(([^)]*)\)/g,
  )) {
    const nsLiterals = [...match[2].matchAll(/['"]([a-zA-Z][\w-]*)['"]/g)].map((m) => m[1])
    const ns = nsLiterals[0] ?? 'common'

    for (const binding of parseBindings(match[1])) {
      fnNames.push(binding.n)
      fnNs.set(binding.n, ns)
    }
  }

  // 文件里用了 i18n 单例（i18n.t('...')）—— 顶层命名空间仍是 defaultNS
  const usesI18nSingleton = /\bi18n\s*\.\s*t\s*\(/.test(text)
  const primaryNs = fnNs.get('t') ?? (fnNames.length ? fnNs.get(fnNames[0]) : 'common')

  const found = []

  // ---- 任意翻译函数调用：`t('key')` / `tc('key')` / `i18n.t('key')`
  const alternatives = [...fnNames, ...(usesI18nSingleton ? ['i18n\\s*\\.\\s*t'] : [])]
  const fnPattern = alternatives.length
    ? new RegExp(`\\b(?:${alternatives.join('|')})\\s*\\(\\s*[\`'"]`, 'g')
    : null

  if (fnPattern) {
    for (const match of text.matchAll(fnPattern)) {
      if (inRanges(commentRanges, match.index)) continue // 注释里的示例代码
      const openParen = text.indexOf('(', match.index)
      if (openParen === -1) continue
      const arg = readFirstArg(text, openParen)
      if (!arg) continue

      // 调用到的函数名（用于取它绑定的命名空间）
      const calledAt = text.slice(match.index, openParen)
      const callee = calledAt.match(/([A-Za-z_$][\w$]*)\s*$/)
      const calleeName = callee?.[1] ?? 't'
      const calleeNs = fnNs.get(calleeName)

      // `t('key', { ns: 'x' })` 的 ns 优先级最高
      const nsOption = readNsOption(readArgsBlock(text, openParen))

      found.push({
        file: rel,
        line: text.slice(0, match.index).split('\n').length,
        raw: arg.raw,
        dynamic: arg.dynamic,
        ns: nsOption ?? calleeNs ?? primaryNs,
        kind: calleeName,
      })
    }
  }

  // ---- <Trans i18nKey="..." ns="..." />
  for (const match of text.matchAll(/<Trans\b[\s\S]{0,400}?\/>/g)) {
    if (inRanges(commentRanges, match.index)) continue
    const block = match[0]
    const key = block.match(/i18nKey=["']([^"']+)["']/)
    if (!key) continue
    const ns = block.match(/\bns=["']([^"']+)["']/)
    found.push({
      file: rel,
      line: text.slice(0, match.index).split('\n').length,
      raw: key[1],
      dynamic: false,
      ns: ns ? ns[1] : primaryNs,
      kind: 'Trans',
    })
  }

  return { file: rel, declaredNs: [...new Set(fnNs.values())], functions: fnNames, keys: found }
}

/** 扫描整个应用源码。 */
export function scanAll(config) {
  const results = []
  for (const file of collectSourceFiles()) {
    const result = scanFile(file, config)
    if (result.keys.length) results.push(result)
  }
  return results
}

/** 拆分 `ns:key` 形式的键。 */
export function splitKey(raw, fallbackNs) {
  const idx = raw.indexOf(':')
  if (idx > 0) return { ns: raw.slice(0, idx), key: raw.slice(idx + 1) }
  return { ns: fallbackNs, key: raw }
}

/** 路径白名单中的动态键例外（如 schema-columns 由调用方传 ns）。 */
export const NS_FROM_OPTIONS_FILES = new Set([
  'apps/web/src/components/data-table/schema-columns.tsx',
])
