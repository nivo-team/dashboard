/**
 * i18n 工具链的共享基础设施：配置加载、语言码归一、键树读写、diff 计算。
 *
 * 设计原则（与仓库既有约定一致）：**只有一个真值**。
 * 语言清单、模块开关、缓存与限额全部来自 `i18n.config.json`，
 * 脚本里不出现第二份硬编码的「7 种语言」。
 *
 * 为什么需要「语言码归一」：本仓历史上存在两套语言码 —— 前端用 `en-US`，
 * 后端 `/lang` 用 `en` / `jp`。配置里允许写短码（`en`、`ar`），由这里统一
 * 解析成前端的 `LocaleKey`，避免再次分叉。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

// ---------------------------------------------------------------- 路径

/** 仓库根：从脚本所在位置向上找到含 i18n.config.json 的目录。 */
function findRoot(start) {
  let dir = start
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'i18n.config.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('找不到仓库根（向上未发现 i18n.config.json）')
}

export const ROOT = findRoot(resolve(import.meta.dirname, '..'))

// ---------------------------------------------------------------- 配置

export function loadConfig() {
  const file = join(ROOT, 'i18n.config.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))

  if (!config.sourceLocale) throw new Error(`i18n.config.json 缺少 sourceLocale`)
  if (!existsSync(join(ROOT, config.messagesDir))) {
    throw new Error(`messagesDir 不存在：${config.messagesDir}`)
  }
  return config
}

// ---------------------------------------------------------------- 语言码

/**
 * 后端 `/lang` 那套非标准短码 → 前端 LocaleKey。
 *
 * 本仓历史上存在两套语言码：前端用 `en-US` / `ja-JP`，后端 `/lang` 用
 * `en` / `jp` / `cn`。`jp`、`cn` 这类**不符合 BCP-47**，无法由「主语言码相同」
 * 推导出来，所以必须显式登记。配置里写短码时优先查这张表。
 */
const LOCALE_ALIASES = {
  cn: 'zh-CN',
  zh: 'zh-CN',
  en: 'en-US',
  jp: 'ja-JP',
  ja: 'ja-JP',
  ar: 'ar-SA',
  hi: 'hi-IN',
  es: 'es-ES',
  tr: 'tr-TR',
}

/**
 * 语言码归一：`en` → `en-US`、`jp` → `ja-JP`、`ar` → `ar-SA` …
 *
 * 规则：完全匹配优先 → 别名表 → 取「主语言码相同」的第一个受支持语言。
 * 目标语言的真值来自 `apps/web/src/lib/locale.ts` 的 SUPPORTED_LOCALES ——
 * 这里刻意从源码读，避免脚本与前端各维护一份语言清单。
 */
let supportedCache = null

export function supportedLocales() {
  if (supportedCache) return supportedCache
  const file = join(ROOT, 'apps/web/src/lib/locale.ts')
  const text = readFileSync(file, 'utf8')
  const keys = [...text.matchAll(/key:\s*'([a-zA-Z-]+)'/g)].map((m) => m[1])
  if (!keys.length) throw new Error('无法从 locale.ts 解析 SUPPORTED_LOCALES')
  supportedCache = keys
  return keys
}

export function normalizeLocale(input) {
  const supported = supportedLocales()
  const raw = String(input).trim()
  if (!raw) throw new Error('语言码为空')

  if (supported.includes(raw)) return raw

  const alias = LOCALE_ALIASES[raw.toLowerCase()]
  if (alias && supported.includes(alias)) return alias

  const primary = raw.toLowerCase().split('-')[0]
  const hit = supported.find((key) => key.toLowerCase().split('-')[0] === primary)
  if (hit) return hit

  throw new Error(
    `无法识别的语言码 \`${raw}\`；受支持的语言：${supported.join(', ')}`,
  )
}

/** 解析逗号分隔的语言清单（CLI / 环境变量共用）。 */
export function parseLocales(value, fallback = []) {
  if (!value) return fallback
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeLocale)
}

// ---------------------------------------------------------------- 模块

/** 磁盘上真实存在的命名空间（目录名）。 */
export function listModules(config = loadConfig()) {
  return readdirSync(join(ROOT, config.messagesDir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** 模块是否被允许翻译（配置缺省视为启用）。 */
export function isModuleEnabled(moduleName, config = loadConfig()) {
  const entry = config.modules?.[moduleName]
  if (entry === undefined) return true
  return entry.enabled !== false
}

export function selectModules(names, config = loadConfig()) {
  const all = listModules(config)
  if (!names || !names.length) return all

  const requested = String(names)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const unknown = requested.filter((name) => !all.includes(name))
  if (unknown.length) {
    throw new Error(
      `未知模块：${unknown.join(', ')}；磁盘上的模块：${all.join(', ')}`,
    )
  }
  return requested
}

// ---------------------------------------------------------------- 键树

/** 把嵌套 JSON 摊平成 `a.b.c` → 值（数组视为叶子，保持原样）。 */
export function flattenKeys(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenKeys(child, path, out)
    } else {
      out.set(path, child)
    }
  }
  return out
}

export function readJson(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`JSON 解析失败 ${file}：${error.message}`)
  }
}

export function moduleFile(moduleName, locale, config = loadConfig()) {
  return join(ROOT, config.messagesDir, moduleName, `${locale}.json`)
}

/** 读取某模块某语言的扁平键树；文件不存在返回 null。 */
export function readModuleKeys(moduleName, locale, config = loadConfig()) {
  const data = readJson(moduleFile(moduleName, locale, config))
  if (data === null) return null
  return flattenKeys(data)
}

// ---------------------------------------------------------------- diff

/**
 * 计算某模块「源语言 → 目标语言」需要翻译的键。
 *
 * 三种状态分别对应三种处置（这是整套流程的核心语义）：
 * - `added`   ：目标语言没有这个键 → 需要翻译
 * - `stale`   ：目标语言有，但与源语言**逐字相同** → 视为未翻译，需要翻译
 * - `edited`  ：目标语言有且与源语言不同 → **有人翻过，一律保留**
 *
 * 最后一条是「不覆盖人工修改」的实现基础：我们只碰 added 与 stale。
 *
 * ⚠️ `stale` 有一个已知误报：`ID` / `URL` / `OK` 这类**跨语言通用值**，
 * 各语言本来就相同。它们不该被反复重翻（白烧 token）——
 * 由 `check.untranslatedAllowlist` 排除。
 */
export function diffModule(moduleName, targetLocale, config = loadConfig()) {
  const source = readModuleKeys(moduleName, config.sourceLocale, config)
  if (source === null) {
    return { module: moduleName, locale: targetLocale, error: '源语言文件不存在' }
  }

  const target = readModuleKeys(moduleName, targetLocale, config)
  const allowlist = new Set(config.check?.untranslatedAllowlist ?? [])
  const added = []
  const stale = []
  const kept = []

  for (const [key, value] of source) {
    if (target === null || !target.has(key)) {
      added.push(key)
      continue
    }
    if (target.get(key) === value) {
      // 通用值（ID / URL …）不算未翻译
      if (typeof value === 'string' && allowlist.has(value.trim())) {
        kept.push(key)
        continue
      }
      stale.push(key)
      continue
    }
    kept.push(key)
  }

  // 目标语言里多出来的键（源语言已删）—— 只报告，不自动删（删除需人确认）
  const orphans = target
    ? [...target.keys()].filter((key) => !source.has(key))
    : []

  return {
    module: moduleName,
    locale: targetLocale,
    added,
    stale,
    kept,
    orphans,
    total: source.size,
  }
}

/** 某语言的「按命名空间拆分的键集合」，用于生成 TS 类型。 */
export function readAllModuleKeys(locale, config = loadConfig()) {
  const out = {}
  for (const moduleName of listModules(config)) {
    const keys = readModuleKeys(moduleName, locale, config)
    if (keys) out[moduleName] = keys
  }
  return out
}

// ---------------------------------------------------------------- 哈希

/** 内容哈希：缓存键与「源文是否变化」判定共用。 */
export function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}
