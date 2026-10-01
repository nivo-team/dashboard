/**
 * 翻译缓存：同一份源文 + 同一个目标语言，只翻一次。
 *
 * 这是「不必每次全盘翻译、省 token」的实现基础：
 * - 缓存命中 → 0 次 AI 调用；
 * - 源文（中文）变了 → 该键的缓存失效，只重翻它；
 * - 缓存文件不进版本库（`.cache` 已在 .gitignore）。
 *
 * 缓存条目形状：
 * ```json
 * {
 *   "version": 1,
 *   "entries": {
 *     "<module>:<keyPath>": {
 *       "src": "用户 ID",        // 当时的源文，用于判断是否过期
 *       "tgt": "User ID",        // 产出的译文
 *       "at": "2026-10-02T…",    // 生成时间（TTL 用）
 *       "model": "…"
 *     }
 *   }
 * }
 * ```
 *
 * 为什么把 `src` 存进缓存而不是只存哈希：读起来能直接看出译文对应的源文，
 * 排查「这句翻错了」时不必回去翻 git 历史。哈希只用于快速比较。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, loadConfig } from './config.mjs'

/** 一个目标语言的缓存文件路径。 */
function cacheFile(locale, config = loadConfig()) {
  return join(ROOT, config.cache?.dir ?? '.cache/i18n', `${locale}.json`)
}

export function loadCache(locale, config = loadConfig()) {
  const file = cacheFile(locale, config)
  const empty = { version: config.cache?.version ?? 1, entries: {} }
  if (!existsSync(file)) return empty

  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data.version !== empty.version) {
      // 缓存格式变了：整份作废，不冒险复用
      return empty
    }
    return { version: data.version, entries: data.entries ?? {} }
  } catch (error) {
    console.warn(`⚠ 缓存文件损坏，按空缓存处理：${file}（${error.message}）`)
    return empty
  }
}

export function saveCache(locale, cache, config = loadConfig()) {
  const file = cacheFile(locale, config)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
}

/** 缓存键：模块 + 键路径。 */
export function entryId(moduleName, keyPath) {
  return `${moduleName}:${keyPath}`
}

/**
 * 取一条可用缓存。
 * @returns {string|null} 命中返回译文，未命中/已过期返回 null
 */
export function getCached(cache, moduleName, keyPath, sourceText, config = loadConfig()) {
  const entry = cache.entries[entryId(moduleName, keyPath)]
  if (!entry) return null

  // 源文变了 → 失效
  if (entry.src !== sourceText) return null

  // TTL：超过 ttlDays 天视为过期（默认 0 表示不按时间过期）
  const ttlDays = config.cache?.ttlDays ?? 0
  if (ttlDays > 0 && entry.at) {
    const age = Date.now() - new Date(entry.at).getTime()
    if (age > ttlDays * 24 * 60 * 60 * 1000) return null
  }

  return entry.tgt ?? null
}

export function putCached(
  cache,
  moduleName,
  keyPath,
  sourceText,
  targetText,
  meta = {},
  config = loadConfig(),
) {
  cache.entries[entryId(moduleName, keyPath)] = {
    src: sourceText,
    tgt: targetText,
    at: new Date().toISOString(),
    model: meta.model ?? 'unknown',
  }
}

/** 清掉缓存里已经不存在于源语言的条目（避免缓存无限膨胀）。 */
export function pruneCache(cache, aliveIds) {
  let removed = 0
  for (const id of Object.keys(cache.entries)) {
    if (!aliveIds.has(id)) {
      delete cache.entries[id]
      removed += 1
    }
  }
  return removed
}
