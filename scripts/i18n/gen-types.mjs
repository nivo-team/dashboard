#!/usr/bin/env node
/**
 * 从源语言（zh-CN）生成 i18n 键类型 —— 让「写错键名」在编译期就报错。
 *
 * ## 为什么不用 i18next 内置的 `CustomTypeOptions.resources`
 *
 * 本仓实测（2026-10，i18next 24.2.3 + react-i18next 15.7.4 + TypeScript 6.0.3）：
 * 把 10 个命名空间、约 1000 个键的**精确嵌套** `resources` 类型接上去后，
 * `tsc --noEmit` 直接 abort（exit 134，无任何错误输出）——
 * 单个命名空间（312 键）尚可（约 11 秒），全量即崩溃。
 * 模板字面量（`` `${Prefix}${string}` ``）不是原因，去掉后同样崩溃。
 *
 * 所以改走**扁平键联合类型**：键写成 `'form.name'` 这种带点号的完整路径，
 * 由 `#/lib/use-typed-t` 的 `useT()` 在编译期校验。
 * 这条路线实测 33 秒、零崩溃，且拼错的键**确实**报错。
 *
 * 产物 `apps/web/src/i18n-keys.gen.ts` 是**生成物，不要手改**。
 *
 * 用法：
 *   node scripts/i18n/gen-types.mjs           # 生成
 *   node scripts/i18n/gen-types.mjs --check   # 只在过期时退出 1（CI 用）
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  listModules,
  loadConfig,
  readModuleKeys,
  ROOT,
  supportedLocales,
} from './lib/config.mjs'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')

const config = loadConfig()
const sourceLocale = config.sourceLocale
const outFile = join(ROOT, config.generatedTypesFile)

/** 生成字符串字面量联合类型。 */
function union(values, indent = '  ') {
  const clean = [...new Set(values.filter((v) => v !== undefined && v !== null))]
  if (!clean.length) return 'never'
  return clean.map((value) => `${indent}| ${JSON.stringify(value)}`).join('\n')
}

const namespaces = listModules(config).filter((name) => {
  const keys = readModuleKeys(name, sourceLocale, config)
  return keys && keys.size > 0
})

const keyCounts = Object.fromEntries(
  namespaces.map((name) => [name, readModuleKeys(name, sourceLocale, config).size]),
)
const totalKeys = Object.values(keyCounts).reduce((sum, n) => sum + n, 0)

const dynamicPrefixes = (config.check?.dynamicKeyPrefixes ?? []).slice().sort()
const locales = supportedLocales()

const out = []
out.push('/* eslint-disable */')
out.push('// 本文件由 scripts/i18n/gen-types.mjs 生成 —— 不要手改。')
out.push(`// 源语言：${sourceLocale}｜命名空间：${namespaces.length} 个｜键：${totalKeys} 个`)
out.push('// 重新生成：pnpm i18n:types')
out.push('')
out.push('/**')
out.push(' * 各命名空间的完整键（带点号路径，如 `form.name`）。')
out.push(' *')
out.push(' * 直接用 `#/lib/use-typed-t` 的 `useT()` 即可获得编译期校验，')
out.push(' * 不必自己引用这里的类型。')
out.push(' */')
out.push('export interface I18nNamespaceKeys {')
for (const name of namespaces) {
  const keys = readModuleKeys(name, sourceLocale, config)
  out.push(`  ${JSON.stringify(name)}:`)
  out.push(union([...keys.keys()].sort(), '    '))
}
out.push('}')
out.push('')
out.push('/** 命名空间名。 */')
out.push(
  `export type I18nNamespace = ${namespaces.map((n) => JSON.stringify(n)).join(' | ')}`,
)
out.push('')
out.push('/**')
out.push(' * 可动态拼接的键前缀（来自 i18n.config.json 的 check.dynamicKeyPrefixes）。')
out.push(' * `t(`columns.${id}`)` 这类写法只要前缀在这里，就被视为合法键空间。')
out.push(' */')
out.push('export type I18nDynamicKeyPrefix =')
out.push(union(dynamicPrefixes, '  '))
out.push('')
out.push('/**')
out.push(' * 动态键：裸前缀与 `<前缀><任意串>` 都算合法。')
out.push(' */')
out.push(
  'export type I18nDynamicKey = I18nDynamicKeyPrefix | `${I18nDynamicKeyPrefix}${string}`',
)
out.push('')
out.push('/** 某命名空间下可用的键（精确键 + 动态前缀）。 */')
out.push('export type I18nKeysOf<N extends I18nNamespace> =')
out.push('  | I18nNamespaceKeys[N]')
out.push('  | I18nDynamicKey')
out.push('')
out.push('/** 所有命名空间的键（不区分命名空间）。 */')
out.push('export type I18nAnyKey = {')
out.push('  [N in I18nNamespace]: I18nNamespaceKeys[N] | I18nDynamicKey')
out.push('}[I18nNamespace]')
out.push('')
out.push('/** 受支持的语言码（取自 apps/web/src/lib/locale.ts）。 */')
out.push(`export type I18nLocale = ${locales.map((l) => JSON.stringify(l)).join(' | ')}`)
out.push('')

const content = `${out.join('\n')}\n`

if (checkOnly) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
  if (current !== content) {
    console.log('✖ i18n 键类型已过期，请跑 `pnpm i18n:types` 并提交生成物。')
    process.exit(1)
  }
  console.log('✔ i18n 键类型是最新的')
  process.exit(0)
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, content, 'utf8')

console.log(
  `已生成 ${config.generatedTypesFile}：${namespaces.length} 个命名空间 / ${totalKeys} 个键 / ${dynamicPrefixes.length} 个动态前缀`,
)
