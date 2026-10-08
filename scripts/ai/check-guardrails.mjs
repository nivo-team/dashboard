#!/usr/bin/env node
/**
 * 铁律的机器门控。
 *
 * ## 新契约下的 i18n 规则（2026-10 起）
 *
 * 开发阶段**只写源语言**（`apps/web/src/messages/<ns>/zh-CN.json`），
 * 其它语言由翻译流水线补齐（`scripts/i18n/translate.mjs` + `.github/workflows/translate.yml`）。
 * 因此原来的「7 语言键必须全齐，否则 ERROR」被拆成两层：
 *
 * | 检查 | 谁负责 | 强度 |
 * | --- | --- | --- |
 * | 源语言缺文件 / 非法文件名 / 源语言没覆盖到某语言 | 本脚本 | **ERROR** |
 * | 目标语言缺键、多键 | 本脚本 | WARN（可见但不阻塞开发） |
 * | 代码用了但源语言没有的键 | `scripts/i18n/check-keys.mjs` | **ERROR** |
 * | 目标语言译文是否最新 | `scripts/i18n/translate.mjs --check` | **ERROR**（CI） |
 *
 * 为什么把「缺译文」降级为 WARN：新契约下**缺译文是正常中间态** ——
 * 开发者写完中文还没跑翻译时，缺键不该阻止他提交。
 * 真正阻止「没翻译就上线」的是 CI 里的 `translate --check`。
 *
 * ## 三组检查
 *
 * 1. i18n 键树（源语言为准，见上表）；
 * 2. 新增代码里不得出现 `dark:` / `font-bold` / `tracking-*`（只看 diff）；
 * 3. 不得触碰流水线自身与依赖清单（只看 diff）。
 *
 * ## 刻意的例外
 *
 * `apps/web/src/messages/dict/**` 跳过键树一致性：字典项文案按
 * `.agents/docs/dict-i18n.md` §2 的约定「只放真实存在的语言，缺就整份回落」，
 * **语言之间本来就可以不同**。
 *
 * 用法：
 *   node scripts/ai/check-guardrails.mjs              # 全量检查
 *   node scripts/ai/check-guardrails.mjs --base <sha> # 额外跑 diff 类检查
 *
 * 退出码：发现 ERROR 为 1，仅 WARN 或全过为 0。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES = ['zh-CN', 'ar-SA']

/** 基准语言：键树的唯一真值，也是「开发时只写这一种」的语言。 */
const SOURCE_LOCALE = 'zh-CN'

/** 键树一致性检查的排除前缀（理由见文件头注释）。 */
const I18N_EXCLUDED_PREFIXES = ['dict']

const errors = []
const warnings = []

const fail = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

// ---------------------------------------------------------------- 工具

function parseArgs(argv) {
  const out = { base: '' }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') out.base = argv[i + 1] ?? ''
  }
  return out
}

/** 取 git diff 里的**新增行**（只看 + 侧，且排除 +++ 文件头）。 */
function addedLines(base, paths) {
  if (!base) return []
  let raw = ''
  try {
    raw = execFileSync(
      'git',
      ['diff', '--unified=0', '--no-color', `${base}...HEAD`, '--', ...paths],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
  } catch (error) {
    // base 取不到（浅克隆、force push 后的悬空 sha 等）不算错误 —— 降级为「只跑全量检查」
    warn(`拿不到 diff（--base ${base}）：${String(error.message).split('\n')[0]}，跳过 diff 类检查`)
    return []
  }

  const files = []
  let current = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = { path: line.slice(6), added: [] }
      files.push(current)
    } else if (line.startsWith('+') && !line.startsWith('+++') && current) {
      current.added.push(line.slice(1))
    }
  }
  return files
}

/** 递归收集「语言文件组」：group 相对路径 → { locale: 完整路径 }。 */
function collectLocaleGroups(root) {
  const groups = new Map()
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const next = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, next)
        continue
      }
      if (!entry.name.endsWith('.json')) continue
      // 注意：这里收**所有** .json，不只看合法语言名 ——
      // 否则 `en.json` / `zh-cn.json` 这种非法写法会被静默忽略，
      // 「非法语言文件名」这条检查将永远不触发。
      const locale = entry.name.slice(0, -'.json'.length)
      if (!groups.has(rel)) groups.set(rel, {})
      groups.get(rel)[locale] = full
    }
  }
  walk(root, '')
  return groups
}

// ---------------------------------------------------------------- 检查 1：i18n 键树

function collectKeys(value, prefix = '') {
  const out = []
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      out.push(...collectKeys(child, path))
    } else {
      out.push(path)
    }
  }
  return out
}

function checkI18n() {
  const root = 'apps/web/src/messages'
  if (!existsSync(root)) {
    warn(`${root} 不存在，跳过 i18n 检查`)
    return
  }

  const groups = collectLocaleGroups(root)
  let checked = 0
  let skippedDict = 0

  for (const [group, byLocale] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // 目录名必须是以语言码命名的 JSON 文件；文件名里的语言码非法 → 明确报错
    const invalid = Object.keys(byLocale).filter((locale) => !LOCALES.includes(locale))
    if (invalid.length) {
      fail(
        `${group}: 存在非法语言文件名（${invalid.join(', ')}）—— 语言码必须取 ${LOCALES.join(' / ')}`,
      )
    }

    if (
      I18N_EXCLUDED_PREFIXES.some((prefix) => group === prefix || group.startsWith(`${prefix}/`))
    ) {
      skippedDict += 1
      continue
    }

    // 源语言文件缺失：这是硬错误 —— 没有真值就无从翻译
    if (!(SOURCE_LOCALE in byLocale)) {
      fail(`${group}: 缺少源语言 ${SOURCE_LOCALE}.json —— 源语言是键树的唯一真值，必须存在`)
      continue
    }

    const baseKeys = new Set(collectKeys(JSON.parse(readFileSync(byLocale[SOURCE_LOCALE], 'utf8'))))
    const available = LOCALES.filter((locale) => locale in byLocale)

    for (const locale of available) {
      if (locale === SOURCE_LOCALE) continue
      const fileId = `${group}/${locale}.json`
      const keys = new Set(collectKeys(JSON.parse(readFileSync(byLocale[locale], 'utf8'))))

      const missing = [...baseKeys].filter((key) => !keys.has(key))
      const extra = [...keys].filter((key) => !baseKeys.has(key))

      // 缺译文在新契约下是**正常中间态**（等翻译流水线补），只提示不阻塞
      if (missing.length) {
        warn(
          `${fileId} 缺 ${missing.length} 个译文键（相对 ${SOURCE_LOCALE}）——` +
            `跑 \`pnpm i18n\` 补齐；CI 的 translate --check 会拦截未翻译就合并：` +
            `${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`,
        )
      }

      // 多出来的键通常是「源语言删了、译文忘删」，但也可能是翻译脚本异常，只提示
      if (extra.length) {
        warn(
          `${fileId} 多 ${extra.length} 个键（${SOURCE_LOCALE} 里没有）—— 源语言删键时请一并清理：` +
            `${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''}`,
        )
      }
    }

    // 源语言存在但目标语言一个都没有：说明这个命名空间还没进翻译范围
    const targets = available.filter((locale) => locale !== SOURCE_LOCALE)
    if (targets.length === 0) {
      warn(
        `${group} 只有源语言 ${SOURCE_LOCALE}，没有任何目标语言 —— ` +
          `若它是要翻译的 UI 命名空间，请在 i18n.config.json 的 targetLocales 里确认；` +
          `若刻意单语言（如字典文案），它应该在 dict/ 下`,
      )
    }

    checked += 1
  }

  if (checked === 0) warn('没有任何命名空间可做键树比对，i18n 检查实际未生效')
  if (skippedDict > 0) {
    console.log(`（跳过 ${skippedDict} 个 dict 组：字典文案按设计允许语言间不一致）`)
  }
}

// ---------------------------------------------------------------- 检查 2：禁用样式

/** 铁律 2 的禁用模式，只扫新增行。注释与文档不在扫描范围内（由 paths 限定）。 */
const FORBIDDEN_PATTERNS = [
  { re: /\bdark:/, label: '`dark:` 变体', hint: '主题由根节点 data-mode 驱动，禁用 dark: 变体' },
  { re: /\bfont-bold\b/, label: '`font-bold`', hint: '标题用 font-semibold、强调用 font-medium' },
  { re: /\btracking-[a-z[]/, label: '`tracking-*`', hint: '本仓禁用字距工具类' },
]

function checkForbiddenStyles(base) {
  if (!base) return
  const files = addedLines(base, [
    'apps/web/src/**/*.ts',
    'apps/web/src/**/*.tsx',
    'apps/web/src/**/*.css',
  ])

  for (const file of files) {
    for (const line of file.added) {
      // 整行注释里出现这些词是合法的（禁令说明、示例）
      if (/^\s*(\*|\/\/)/.test(line)) continue
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')

      for (const { re, label, hint } of FORBIDDEN_PATTERNS) {
        if (re.test(code)) {
          fail(
            `${file.path}：新增代码里出现 ${label}（${hint}）\n    > ${line.trim().slice(0, 120)}`,
          )
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 检查 3：AI 不得触碰的范围

const PROTECTED_PATHS = [
  { test: (p) => p.startsWith('.github/workflows/'), why: '流水线配置（改门控等于改规则本身）' },
  { test: (p) => p === '.github/labels.yml', why: '标签体系定义' },
  { test: (p) => p.startsWith('.github/ai/'), why: 'AI 提示词与门控自身' },
  { test: (p) => p.startsWith('scripts/ai/'), why: '铁律门控的实现（能改它就等于能改规则）' },
  { test: (p) => p === 'pnpm-lock.yaml', why: '依赖锁文件' },
  { test: (p) => p === 'AGENTS.md', why: '仓库铁律与索引（应由人修改）' },
]

function checkProtectedPaths(base) {
  if (!base) return
  const files = addedLines(base, ['**/*'])
  for (const file of files) {
    for (const { test, why } of PROTECTED_PATHS) {
      if (test(file.path)) {
        warn(`${file.path}：属于受保护路径 —— ${why}。若确属必要，请人在 PR 里说明。`)
      }
    }
  }
}

// ---------------------------------------------------------------- 主流程

const options = parseArgs(process.argv.slice(2))

console.log(
  `铁律门控：i18n 键树（源语言 ${SOURCE_LOCALE} 为准）+ ` +
    `${options.base ? `diff 检查（base=${options.base.slice(0, 8)}）` : '（未给 --base，跳过 diff 检查）'}`,
)

checkI18n()
checkForbiddenStyles(options.base)
checkProtectedPaths(options.base)

for (const message of warnings) console.log(`::warning::${message}`)

if (errors.length) {
  console.log('')
  for (const message of errors) console.log(`::error::${message}`)
  console.log(`\n铁律门控未通过：${errors.length} 个错误、${warnings.length} 个警告。`)
  process.exit(1)
}

console.log(`铁律门控通过（${warnings.length} 个警告）。`)
