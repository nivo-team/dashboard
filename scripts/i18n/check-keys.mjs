#!/usr/bin/env node
/**
 * 键检测：找出「代码里用了、但源语言文件里没有」的 i18n 键。
 *
 * 这是铁律 1 在新契约下的前半段：
 *   代码只写源语言（zh-CN） → 本脚本保证源语言文件真的**有**这些键
 *                            → 翻译流水线再把它们补到其它语言
 *
 * 与 `check-guardrails.mjs` 的分工：
 * - 本脚本看 **代码 ↔ 源语言 JSON**（键是否存在）；
 * - guardrails 看 **源语言 ↔ 目标语言 JSON**（键树是否同步）。
 *
 * 命名空间怎么定（从硬到软，避免依赖「哪个文件该用哪个 ns」的记忆）：
 * 1. 键写成 `ns:key` → 直接用；
 * 2. 文件里有 `useTranslation('ns')` → 用它；
 * 3. 都没有 → **按键的存在性反推**：这个键只在哪个命名空间里，就是哪个。
 *    命中多个 → 报「跨命名空间」提示（键名在多个模块重复）；一个都没有 → 缺失。
 *
 * 用法：
 *   node scripts/i18n/check-keys.mjs             # 报告
 *   node scripts/i18n/check-keys.mjs --strict    # 有缺失时退出码 1（CI 用）
 *   node scripts/i18n/check-keys.mjs --json      # 机器可读输出
 */
import { listModules, loadConfig, readModuleKeys } from './lib/config.mjs'
import { NS_FROM_OPTIONS_FILES, scanAll, splitKey } from './lib/scanner.mjs'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const asJson = args.includes('--json')

const config = loadConfig()

// ---------------------------------------------------------------- 源语言索引

/** module → Set(key) */
const sourceKeys = {}
for (const moduleName of listModules(config)) {
  const keys = readModuleKeys(moduleName, config.sourceLocale, config)
  if (keys) sourceKeys[moduleName] = keys
}

/** key → 含它的所有命名空间（用于存在性反推）。 */
const keyToModules = new Map()
for (const [moduleName, keys] of Object.entries(sourceKeys)) {
  for (const key of keys.keys()) {
    if (!keyToModules.has(key)) keyToModules.set(key, [])
    keyToModules.get(key).push(moduleName)
  }
}

const dynamicPrefixes = config.check?.dynamicKeyPrefixes ?? []

// ---------------------------------------------------------------- 扫描

const missing = []
const wrongNs = []
const dynamic = []
const ambiguous = []
const stats = { files: 0, keys: 0, static: 0, dynamic: 0 }

for (const fileResult of scanAll(config)) {
  stats.files += 1
  const nsFromOptions = NS_FROM_OPTIONS_FILES.has(fileResult.file)

  for (const entry of fileResult.keys) {
    stats.keys += 1

    // ---- 动态键：命中前缀白名单即视为已知
    if (entry.dynamic) {
      stats.dynamic += 1
      const { key } = splitKey(entry.raw.replace(/\$\{\}/g, ''), entry.ns ?? '')
      const covered = dynamicPrefixes.some(
        (prefix) => key.startsWith(prefix) || prefix.startsWith(key),
      )
      if (!covered) dynamic.push({ ...entry, key })
      continue
    }

    stats.static += 1
    if (nsFromOptions) continue // 命名空间由调用方注入（schema-columns）

    const explicit = splitKey(entry.raw, null)

    /*
      拼上 `keyPrefix`（`useTranslation('example', { keyPrefix: 'table' })`）——
      i18next 运行时会把前缀拼在键前面，静态检查必须照做，
      否则整批键会被误报成「缺失」（实际存在，只是路径少了一段）。

      两种情况**不拼**，因为 i18next 也不拼：
      1. 显式写了 `ns:key`（已给完整键）；
      2. 调用参数里另指定了 `ns`（`t('x', { ns: 'common' })`）—— 前缀只作用于
         本命名空间，跨命名空间取键时会被忽略。
    */
    const usesOtherNs = Boolean(explicit.ns) || Boolean(entry.nsOption)
    const prefix = entry.keyPrefix && !usesOtherNs ? `${entry.keyPrefix}.` : ''
    const fullKey = `${prefix}${explicit.key}`
    const owners = keyToModules.get(fullKey) ?? []

    // 该引用所属的命名空间：显式 `ns:key` > useTranslation 声明（未声明即 common）
    const ns = explicit.ns ?? entry.ns ?? 'common'
    const keys = sourceKeys[ns]

    if (!keys) {
      missing.push({ ...entry, ns, key: fullKey, reason: `命名空间 ${ns} 不存在` })
      continue
    }
    if (keys.has(fullKey)) continue

    // 声明的命名空间里没有这个键 —— 但它可能在别的命名空间里
    if (owners.length === 1 && owners[0] !== ns) {
      wrongNs.push({ ...entry, ns, key: fullKey, actual: owners[0] })
      continue
    }
    if (owners.length > 1 && !owners.includes(ns)) {
      ambiguous.push({ ...entry, key: fullKey, owners, ns })
      continue
    }

    missing.push({
      ...entry,
      ns,
      key: fullKey,
      reason: `键不在 ${ns}/${config.sourceLocale}.json`,
    })
  }
}

// ---------------------------------------------------------------- 输出

const ambiguousLimited = ambiguous

if (asJson) {
  console.log(
    JSON.stringify({ stats, missing, wrongNs, dynamic, ambiguous: ambiguousLimited }, null, 2),
  )
} else {
  console.log(
    `键检测：扫描 ${stats.files} 个文件 / ${stats.keys} 处引用（静态 ${stats.static}、动态 ${stats.dynamic}）`,
  )

  if (missing.length) {
    console.log(`\n✖ 代码用了但源语言找不到的键（${missing.length}）—— 用户会看到键名，必须补：`)
    for (const item of missing) {
      console.log(`  ${item.file}:${item.line}  ${item.ns}:${item.key}   (${item.reason})`)
    }
  }

  if (wrongNs.length) {
    console.log(
      `\n▲ 命名空间用错（${wrongNs.length}）—— 键真实存在于另一个命名空间，请改引用（键本身通常在 common）：`,
    )
    for (const item of wrongNs) {
      console.log(
        `  ${item.file}:${item.line}  '${item.raw}'  现在按 ${item.ns} 解析，实际在 ${item.actual}`,
      )
    }
  }

  if (dynamic.length) {
    console.log(
      `\n~ 动态键未命中白名单（${dynamic.length}）—— 若确为有限集合，加进 check.dynamicKeyPrefixes：`,
    )
    for (const item of dynamic) {
      console.log(`  ${item.file}:${item.line}  '${item.raw}'`)
    }
  }

  if (ambiguousLimited.length) {
    console.log(
      `\n· 键名在多个命名空间都存在且都不等于当前命名空间（${ambiguousLimited.length}）：`,
    )
    for (const item of ambiguousLimited.slice(0, 20)) {
      console.log(
        `  ${item.file}:${item.line}  '${item.raw}'  按 ${item.ns} 解析，候选: ${item.owners.join(' / ')}`,
      )
    }
    if (ambiguousLimited.length > 20) {
      console.log(`  …还有 ${ambiguousLimited.length - 20} 处`)
    }
  }

  if (!missing.length && !wrongNs.length && !dynamic.length) {
    console.log('\n✔ 代码里引用的静态键都能在源语言文件中找到')
  }
}

if (strict && missing.length) {
  console.log(`\n键检测未通过：${missing.length} 个键缺失。`)
  process.exit(1)
}
process.exit(0)
