#!/usr/bin/env node
/**
 * 铁律的机器门控。
 *
 * 为什么需要它：`AGENTS.md` 里的铁律（7 语言齐全、禁用某些样式、只有一个真值、
 * 不手改生成物）原本只写在文档里 —— 靠的是「读文档的人记得住」。
 * AI 每次都是新会话，**文档约束不住它，只有检查能**。
 *
 * 三组检查：
 *   1. i18n 键树一致（铁律 1）—— 全量；
 *   2. 新增代码里不得出现 `dark:` / `font-bold` / `tracking-*`（铁律 2）—— 只看 diff；
 *   3. 不得触碰流水线自身与依赖清单 —— 只看 diff。
 *
 * 两处**刻意的例外**（不是漏检）：
 * - `apps/web/src/messages/dict/**` 跳过键树一致性：字典项文案按 `.agents/docs/dict-i18n.md` §2
 *   的约定「只放真实存在的语言，缺就整份回落」，**语言之间本来就可以不同**；
 * - `apps/web/src/messages/langs/**` 这类只铺了部分语言的 UI 命名空间**报 warning 而非 error** ——
 *   它确实是铁律 1 的欠债，但无法由脚本判定「是遗漏还是刻意」，所以让它可见、不阻塞。
 *
 * **基线机制**：接入门控时本仓已有存量违规（见 .github/ai/i18n-baseline.json）。
 * 直接把存量当错误会「第一天就红」，于是约定：基线里的键被豁免、基线之外的新增一律挡住、
 * 基线里被修好的键会提示收窄（否则基线腐化成永久豁免名单）。
 *
 * 用法：
 *   node scripts/ai/check-guardrails.mjs                    # 全量检查
 *   node scripts/ai/check-guardrails.mjs --base <sha>       # 额外跑 diff 类检查
 *   node scripts/ai/check-guardrails.mjs --write-baseline   # 生成/更新基线（人工确认后提交）
 *
 * 退出码：发现 ERROR 为 1，仅 WARN 或全过为 0。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ar-SA', 'hi-IN', 'es-ES', 'tr-TR']

/** 基准语言：键树的参照物。其它语言缺键或多键都以此为准。 */
const BASE_LOCALE = 'zh-CN'

/** 键树一致性检查的排除前缀（理由见文件头注释）。 */
const I18N_EXCLUDED_PREFIXES = ['dict']

const errors = []
const warnings = []

const fail = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

// ---------------------------------------------------------------- 工具

function parseArgs(argv) {
  const out = {
    base: '',
    baseline: '.github/ai/i18n-baseline.json',
    writeBaseline: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') out.base = argv[i + 1] ?? ''
    else if (argv[i] === '--baseline') out.baseline = argv[i + 1] ?? ''
    else if (argv[i] === '--write-baseline') out.writeBaseline = true
  }
  return out
}

function loadBaseline(path) {
  if (!path || !existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    warn(`基线文件解析失败（${path}）：${String(error.message).split('\n')[0]} —— 本次按「无基线」处理`)
    return {}
  }
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
      const locale = entry.name.slice(0, -'.json'.length)
      if (!LOCALES.includes(locale)) continue
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

/**
 * @returns {Record<string, string[]>} 形如 { 'common/en-US.json': ['a.b', ...] }
 */
function checkI18n(baseline) {
  const root = 'apps/web/src/messages'
  const currentMissing = {}
  if (!existsSync(root)) {
    warn(`${root} 不存在，跳过 i18n 检查`)
    return currentMissing
  }

  const groups = collectLocaleGroups(root)
  let checked = 0
  let skippedDict = 0

  for (const [group, byLocale] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (I18N_EXCLUDED_PREFIXES.some((prefix) => group === prefix || group.startsWith(`${prefix}/`))) {
      skippedDict += 1
      continue
    }

    const available = LOCALES.filter((locale) => locale in byLocale)

    // 只铺了一种语言：无法做键树比对，但「缺 6 种语言」本身值得可见（见文件头注释）
    if (available.length < 2) {
      warn(
        `${group} 只铺了 ${available.length}/7 种语言（${available.join(',') || '无'}）——` +
          `若是 UI 命名空间，非中文用户会整份回落到中文；若是刻意单语言，请在脚本的例外里写明`,
      )
      continue
    }

    if (!(BASE_LOCALE in byLocale)) {
      warn(`${group}: 缺少基准语言 ${BASE_LOCALE}.json，跳过该命名空间`)
      continue
    }

    const baseKeys = new Set(collectKeys(JSON.parse(readFileSync(byLocale[BASE_LOCALE], 'utf8'))))

    for (const locale of available) {
      if (locale === BASE_LOCALE) continue
      const fileId = `${group}/${locale}.json`
      const keys = new Set(collectKeys(JSON.parse(readFileSync(byLocale[locale], 'utf8'))))

      const missing = [...baseKeys].filter((key) => !keys.has(key))
      const extra = [...keys].filter((key) => !baseKeys.has(key))

      if (missing.length) {
        currentMissing[fileId] = missing
        const exempt = new Set(baseline[fileId] ?? [])
        const real = missing.filter((key) => !exempt.has(key))
        if (real.length) {
          fail(
            `${fileId} 缺 ${real.length} 个键（相对 ${BASE_LOCALE}）：` +
              `${real.slice(0, 8).join(', ')}${real.length > 8 ? ' …' : ''}`,
          )
        }
      }

      // 「多键」不设基线：它和「删掉基准键却漏删译文」是同一个改动的问题
      if (extra.length) {
        fail(
          `${fileId} 多 ${extra.length} 个键（${BASE_LOCALE} 里没有）：` +
            `${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ' …' : ''}`,
        )
      }
    }

    const missingLocales = LOCALES.filter((locale) => !(locale in byLocale))
    if (missingLocales.length) {
      warn(`${group} 缺 ${missingLocales.length} 种语言文件：${missingLocales.join(', ')}`)
    }

    checked += 1
  }

  if (checked === 0) warn('没有任何命名空间可做键树比对，i18n 检查实际未生效')
  if (skippedDict > 0) console.log(`（跳过 ${skippedDict} 个 dict 组：字典文案按设计允许语言间不一致）`)

  // 反向检查：基线里已经修好的条目应当被收窄，否则基线会腐化
  for (const [fileId, keys] of Object.entries(baseline)) {
    const stillMissing = new Set(currentMissing[fileId] ?? [])
    const fixed = keys.filter((key) => !stillMissing.has(key))
    if (fixed.length) {
      warn(
        `${fileId} 基线里有 ${fixed.length} 个键已经补齐，请跑 --write-baseline 收窄基线：` +
          `${fixed.slice(0, 5).join(', ')}${fixed.length > 5 ? ' …' : ''}`,
      )
    }
  }

  return currentMissing
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
  const files = addedLines(base, ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx', 'apps/web/src/**/*.css'])

  for (const file of files) {
    for (const line of file.added) {
      // 整行注释里出现这些词是合法的（禁令说明、示例）
      if (/^\s*(\*|\/\/)/.test(line)) continue
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')

      for (const { re, label, hint } of FORBIDDEN_PATTERNS) {
        if (re.test(code)) {
          fail(`${file.path}：新增代码里出现 ${label}（${hint}）\n    > ${line.trim().slice(0, 120)}`)
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
const baseline = loadBaseline(options.baseline)

console.log(
  `铁律门控：i18n 全量检查 + ${options.base ? `diff 检查（base=${options.base.slice(0, 8)}）` : '（未给 --base，跳过 diff 检查）'}` +
    `${Object.keys(baseline).length ? `，基线豁免 ${Object.keys(baseline).length} 个文件` : ''}`,
)

const currentMissing = checkI18n(baseline)
checkForbiddenStyles(options.base)
checkProtectedPaths(options.base)

if (options.writeBaseline) {
  const sorted = Object.fromEntries(
    Object.entries(currentMissing)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, keys]) => [file, [...keys].sort()]),
  )
  mkdirSync(dirname(options.baseline), { recursive: true })
  writeFileSync(options.baseline, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
  const total = Object.values(sorted).reduce((sum, keys) => sum + keys.length, 0)
  console.log(`已写入基线：${options.baseline}（${Object.keys(sorted).length} 个文件 / ${total} 个键）`)
  process.exit(0)
}

for (const message of warnings) console.log(`::warning::${message}`)

if (errors.length) {
  console.log('')
  for (const message of errors) console.log(`::error::${message}`)
  console.log(`\n铁律门控未通过：${errors.length} 个错误、${warnings.length} 个警告。`)
  process.exit(1)
}

console.log(`铁律门控通过（${warnings.length} 个警告）。`)
