#!/usr/bin/env node
/**
 * 翻译流水线主脚本：把源语言（zh-CN）的新增/变更键翻到目标语言。
 *
 * ## 它解决什么
 *
 * 开发阶段只写 `zh-CN.json`（见 AGENTS.md 铁律 1）。脚本负责把缺的补到
 * 其它语言 —— 只翻**增量**、命中缓存就 0 token、可以只翻某个模块。
 *
 * ## 三种键状态（核心语义）
 *
 * | 状态 | 判定 | 处置 |
 * | --- | --- | --- |
 * | `added` | 目标语言没有这个键 | 翻译 |
 * | `stale` | 目标语言的值与源语言**逐字相同** | 翻译（视为未翻） |
 * | `edited` | 目标语言的值与源语言不同 | **保留，绝不覆盖** |
 *
 * 最后一条保证了「人工改过的译文不会被机器冲掉」。这也让**存量翻译**天然安全：
 * 仓库里已有的 6 种语言译文都属于 `edited`，首跑不会动它们。
 *
 * ## 用法
 *
 * ```bash
 * pnpm i18n:dry                       # 只报告计划，不写文件、不调 AI
 * pnpm i18n                           # 按配置翻全部目标语言
 * pnpm i18n -- --module=users         # 只翻 users 这一个模块
 * pnpm i18n -- --locale=en-US,ar-SA   # 只翻指定语言（短码也行：en,ar）
 * pnpm i18n -- --force --module=users # 忽略缓存重翻
 * pnpm i18n -- --check                # 校验：是否还有未翻译的键（CI 用）
 * ```
 *
 * 环境变量（CI 里更常用）：
 * - `I18N_TARGET_LOCALES=en,ar`  覆盖目标语言
 * - `I18N_MODULES=users,roles`   覆盖模块范围
 *
 * 退出码：`--check` 时若有未翻译键为 1，其余情况 0。
 */
import { writeFileSync, existsSync } from 'node:fs'
import {
  diffModule,
  isModuleEnabled,
  loadConfig,
  moduleFile,
  normalizeLocale,
  parseLocales,
  readJson,
  selectModules,
  ROOT,
} from './lib/config.mjs'
import { getCached, loadCache, putCached, saveCache } from './lib/cache.mjs'
import { translateBatch } from './lib/provider.mjs'

// ---------------------------------------------------------------- 参数

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(`--${name}`)
const getFlag = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

const config = loadConfig()
const dryRun = hasFlag('dry')
const checkOnly = hasFlag('check')
const force = hasFlag('force')
const includeStale = hasFlag('include-stale')
const showStats = hasFlag('stats')
const asJson = hasFlag('json')

// 目标语言：CLI > 环境变量 > 配置
const targetLocales = parseLocales(
  getFlag('locale') ?? process.env.I18N_TARGET_LOCALES,
  config.targetLocales.map(normalizeLocale),
)

// 模块范围：CLI > 环境变量 > 全部
const requestedModules = getFlag('module') ?? process.env.I18N_MODULES

// ---------------------------------------------------------------- 资源

const glossaryFile = config.glossaryFile ? `${ROOT}/${config.glossaryFile}` : null
const glossary =
  glossaryFile && existsSync(glossaryFile) ? (readJson(glossaryFile)?.terms ?? {}) : {}

/** 模块的中文说明 —— 给模型一点上下文，译文更贴切。 */
const moduleDescriptions = glossary?.__modules ?? {}

const allModules = selectModules(requestedModules, config).filter((name) =>
  isModuleEnabled(name, config),
)

/** 递归给嵌套对象按 `a.b.c` 路径写值（缺失的中间层自动补）。 */
function setByPath(root, path, value) {
  const parts = path.split('.')
  let node = root
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (node[key] === null || typeof node[key] !== 'object' || Array.isArray(node[key])) {
      node[key] = {}
    }
    node = node[key]
  }
  node[parts[parts.length - 1]] = value
}

// ---------------------------------------------------------------- 主流程

const stats = {
  locales: targetLocales.length,
  modules: allModules.length,
  pending: 0, // 需要翻译的键数
  cached: 0, // 缓存命中（0 token）
  translated: 0, // 实际调用 AI 翻出来的
  failed: 0, // 模型漏翻的
  kept: 0, // 保留的人工/存量译文
  unchanged: 0, // 本次没有变化的键
  staleSkipped: 0, // 与源文逐字相同、但默认不动的键
  filesWritten: [],
  errors: [],
}

const report = []

for (const locale of targetLocales) {
  const cache = loadCache(locale, config)

  for (const moduleName of allModules) {
    const diff = diffModule(moduleName, locale, config)
    if (diff.error) {
      stats.errors.push(`${moduleName}/${locale}: ${diff.error}`)
      continue
    }

    /*
      `stale` 默认**不动**。

      原因：`stale` 的判定是「目标语言的值与源语言逐字相同」，它**不能可靠地推断
      「漏翻」** —— 反例就在本仓里：
      - 本来就该相同：`Ask AI`、`Ctrl K`、`string`、`/system/menus`、`n:menus:list`
        （品牌名 / 快捷键 / 代码 / 路径 / 权限标识）；
      - 汉字文化圈共用：日语里 `操作`、`保存`、`停止`、`最大化` 与中文同形。

      把它们当漏翻会**反复重翻**（每次结果还是同一个值 → 下次仍是 stale），
      既白烧 token，又让 `--check` 永远不通过。
      所以默认只翻真正缺失的 `added`；确需重翻时显式 `--include-stale`。
    */
    const pendingKeys =
      force || includeStale
        ? [...diff.added, ...diff.stale].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        : [...diff.added].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    if (!includeStale && !force) stats.staleSkipped += diff.stale.length

    stats.kept += diff.kept.length
    stats.unchanged += diff.kept.length

    if (!pendingKeys.length) continue

    // 源文（用来判断缓存是否过期、以及发给模型）
    const sourceData = readJson(moduleFile(moduleName, config.sourceLocale, config))
    const sourceFlat = {}
    {
      // 复用 diff 的键路径，从源 JSON 取值
      const walk = (value, prefix) => {
        for (const [k, child] of Object.entries(value)) {
          const path = prefix ? `${prefix}.${k}` : k
          if (child && typeof child === 'object' && !Array.isArray(child)) walk(child, path)
          else sourceFlat[path] = child
        }
      }
      walk(sourceData, '')
    }

    const todo = {}
    for (const key of pendingKeys) {
      const sourceText = sourceFlat[key]
      if (typeof sourceText !== 'string' || !sourceText.trim()) continue

      if (!force) {
        const cached = getCached(cache, moduleName, key, sourceText, config)
        if (cached) {
          todo[key] = { source: sourceText, fromCache: cached }
          stats.cached += 1
          stats.pending += 1
          continue
        }
      }
      todo[key] = { source: sourceText, fromCache: null }
      stats.pending += 1
    }

    const needsAi = Object.entries(todo).filter(([, v]) => v.fromCache === null)
    if (!needsAi.length && !Object.keys(todo).length) continue

    report.push({
      locale,
      module: moduleName,
      pending: Object.keys(todo).length,
      cached: Object.keys(todo).length - needsAi.length,
      viaAi: needsAi.length,
    })

    if (checkOnly || dryRun) continue

    // ---- 逐批翻译
    const targetData = readJson(moduleFile(moduleName, locale, config)) ?? {}
    let wroteAnything = false

    // 1) 缓存命中的直接写
    for (const [key, item] of Object.entries(todo)) {
      if (item.fromCache === null) continue
      setByPath(targetData, key, item.fromCache)
      wroteAnything = true
    }

    // 2) 需要 AI 的分批翻
    const batchSize = config.limits?.batchSize ?? 40
    for (let i = 0; i < needsAi.length; i += batchSize) {
      const batch = needsAi.slice(i, i + batchSize)
      const entries = Object.fromEntries(batch.map(([k, v]) => [k, v.source]))

      try {
        const { translations, model } = await translateBatch({
          sourceLocale: config.sourceLocale,
          targetLocale: locale,
          moduleName,
          entries,
          glossary,
          moduleDescriptions,
        })

        for (const [key, value] of Object.entries(translations)) {
          setByPath(targetData, key, value)
          putCached(cache, moduleName, key, entries[key], value, { model }, config)
          stats.translated += 1
          wroteAnything = true
        }

        const missed = batch.filter(([k]) => !(k in translations))
        if (missed.length) {
          stats.failed += missed.length
          stats.errors.push(
            `${moduleName}/${locale}: 模型漏翻 ${missed.length} 个键（${missed
              .slice(0, 3)
              .map(([k]) => k)
              .join(', ')}${missed.length > 3 ? ' …' : ''}）`,
          )
        }
      } catch (error) {
        stats.errors.push(`${moduleName}/${locale}: ${error.message}`)
      }
    }

    if (wroteAnything) {
      const file = moduleFile(moduleName, locale, config)
      writeFileSync(file, `${JSON.stringify(targetData, null, 2)}\n`, 'utf8')
      stats.filesWritten.push(`${moduleName}/${locale}.json`)
    }

    saveCache(locale, cache, config)
  }
}

// ---------------------------------------------------------------- 输出

if (asJson) {
  console.log(JSON.stringify({ stats, report }, null, 2))
} else {
  const mode = checkOnly ? '检查' : dryRun ? '预演（不写文件、不调 AI）' : '翻译'
  console.log(
    `i18n ${mode}：源语言 ${config.sourceLocale} → ${targetLocales.join(', ')}｜模块 ${allModules.length} 个`,
  )

  if (report.length) {
    console.log('\n计划：')
    for (const row of report) {
      console.log(
        `  ${row.locale.padEnd(6)} ${row.module.padEnd(10)} 待翻 ${String(row.pending).padStart(3)}` +
          `（缓存命中 ${row.cached}，需 AI ${row.viaAi}）`,
      )
    }
  } else {
    console.log('\n✔ 没有需要翻译的键')
  }

  if (showStats || !dryRun) {
    console.log(
      `\n合计：待翻 ${stats.pending}｜缓存命中 ${stats.cached}｜AI 翻译 ${stats.translated}｜` +
        `漏翻 ${stats.failed}｜保留既有译文 ${stats.kept}`,
    )
    if (stats.filesWritten.length) {
      console.log(`写入文件：${stats.filesWritten.length} 个`)
    }
  }

  // `stale` 是报告项、不是待办项 —— 说清楚为什么不动，避免被当成漏翻
  if (stats.staleSkipped > 0 && !includeStale && !force) {
    console.log(`\nℹ 另有 ${stats.staleSkipped} 个键的译文与中文**逐字相同**，已跳过（不算漏翻）。`)
    console.log(
      '  常见原因：品牌名/快捷键/代码/路径本来就该原样（Ask AI、Ctrl K、string、/system/menus），',
    )
    console.log('  以及日语等汉字文化圈语言与中文同形（操作、保存、停止）。')
    console.log('  如确认其中确有漏翻，用 `--include-stale` 重新翻译它们。')
  }

  if (stats.errors.length) {
    console.log('\n问题：')
    for (const message of stats.errors.slice(0, 20)) console.log(`  ⚠ ${String(message)}`)
    if (stats.errors.length > 20) console.log(`  …还有 ${stats.errors.length - 20} 条`)
  }
}

// ---------------------------------------------------------------- 退出码

if (stats.errors.length && !checkOnly) {
  console.log(`\n翻译未完成：${stats.errors.length} 个问题。`)
  process.exit(1)
}

if (checkOnly) {
  const totalPending = report.reduce((sum, row) => sum + row.viaAi, 0)
  if (totalPending > 0) {
    console.log(`\n✖ 还有 ${totalPending} 个键没有译文 —— 跑 \`pnpm i18n\` 生成译文后提交。`)
    process.exit(1)
  }
  console.log('\n✔ 所有目标语言的译文都是最新的')
}
