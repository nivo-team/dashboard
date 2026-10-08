import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { dictKeyOf, dictModuleOf, dictPathOf } from './dict-key'
import { useLocale } from './use-locale'

/**
 * 字典文案（`src/messages/dict/<模块>/<locale>.json`）的读取入口。
 *
 * 这是**可选的多语言覆盖**能力，不配也能正常工作 —— 未收录的 key 会回落到
 * 后端下发的 `label`。当前仓库没有放置任何字典文案文件，需要时按目录约定补即可。
 *
 * 完整约定见 `.agents/docs/dict-i18n.md`，这里只强调三点实现上的取舍：
 *
 * 1. **按模块懒加载**：`import.meta.glob` **不带 `eager`**，构建时每个 JSON 独立成 chunk，
 *    首屏不加载任何字典文案；只有真正渲染到某模块的枚举值时才拉「该模块 × 当前语言」。
 *    这是它与 `src/lib/i18n.ts`（UI 文案，`eager: true` 全量进内存）**不能合并**的原因。
 * 2. **回落链**：当前语言文件 → `zh-CN` 文件 → 调用方给的 fallback（通常是后端 `label`）→ `value`。
 *    所以「当前语言」与「zh-CN」两份一起加载（同语言时只加载一份）。
 * 3. **循环里不要调 hook**：批量场景（如把一整列角色值转成文案）先 `useDictMessages(module)`
 *    取到文案表，再用纯函数 `pickDictText()` 逐个取值。
 */

/** 缺语言文件时的整份回落语言。 */
const FALLBACK_LOCALE = 'zh-CN'

/** 缓存保留时长：字典文案是静态资源，但离开后允许回收，避免长期占内存。 */
const CACHE_GC_TIME = 30 * 60_000

const dictModuleLoaders = import.meta.glob<Record<string, unknown>>('/src/messages/dict/*/*.json', {
  import: 'default',
})

type DictJson = Record<string, unknown>
type DictLocaleLoaders = Record<string, () => Promise<DictJson>>

/** 模块 → 语言 → 动态 import。构建期由 glob 静态生成，无需手动维护。 */
const DICT_MODULE_INDEX: Record<string, DictLocaleLoaders> = {}

for (const filePath in dictModuleLoaders) {
  const match = filePath.match(/\/messages\/dict\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue
  const [, moduleName, locale] = match
  const loaders = (DICT_MODULE_INDEX[moduleName] ??= {})
  loaders[locale] = dictModuleLoaders[filePath]
}

/** 一个模块在当前语言下的两份文案表（`primary` = 当前语言，`fallback` = zh-CN）。 */
export type DictMessages = {
  primary: DictJson
  fallback: DictJson
}

const EMPTY_MESSAGES: DictMessages = { primary: {}, fallback: {} }

// dict path 的命名空间适配与解析统一在 ./dict-key —— 架构升级（去掉 `new.` 前缀）时只改那一个文件；
// 这里继续对外导出，保持既有导入路径不变。
export { dictKeyOf, dictModuleOf, dictPathOf }

/** 按点分路径逐层下钻。 */
function descend(table: DictJson | undefined, path: string): unknown {
  let current: unknown = table
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as DictJson)[segment]
  }
  return current
}

/**
 * 从**一份**已加载的文案表里取某个字典项的文案（纯函数，可在循环里安全调用）。
 *
 * 取不到返回 `null` —— 交给调用方决定回落（通常是再查一次 zh-CN 表）。
 */
export function pickDictText(
  table: DictJson | undefined,
  dictKey: string | null,
  value?: string | number | null,
): string | null {
  if (!table || !dictKey) return null
  if (value === null || value === undefined || value === '') return null

  const node = descend(table, dictKey)
  if (!node || typeof node !== 'object') return null

  const text = (node as DictJson)[String(value)]
  return typeof text === 'string' && text.length > 0 ? text : null
}

/** 依次按 primary → fallback 取值；都取不到返回 `null`。 */
export function pickDictTextWithFallback(
  messages: DictMessages | undefined,
  dictKey: string | null,
  value?: string | number | null,
): string | null {
  return (
    pickDictText(messages?.primary, dictKey, value) ??
    pickDictText(messages?.fallback, dictKey, value)
  )
}

async function loadDictMessages(moduleName: string, locale: string): Promise<DictMessages> {
  const loaders = DICT_MODULE_INDEX[moduleName]
  if (!loaders) return EMPTY_MESSAGES

  const primaryLoader = loaders[locale]
  const fallbackLoader = locale === FALLBACK_LOCALE ? undefined : loaders[FALLBACK_LOCALE]

  const [primary, fallback] = await Promise.all([
    primaryLoader ? primaryLoader() : Promise.resolve({}),
    fallbackLoader ? fallbackLoader() : Promise.resolve({}),
  ])

  return { primary: primary ?? {}, fallback: fallback ?? {} }
}

/**
 * 取某个模块在当前界面语言下的文案表（按 `(模块, 语言)` 缓存）。
 *
 * 只被渲染到的模块才会加载；`moduleName` 为空时不会发请求。
 */
export function useDictMessages(moduleName?: string | null) {
  const { locale } = useLocale()

  return useQuery({
    queryKey: ['dict-messages', moduleName ?? null, locale] as const,
    queryFn: () => loadDictMessages(moduleName as string, locale),
    enabled: Boolean(moduleName),
    staleTime: Infinity,
    gcTime: CACHE_GC_TIME,
  })
}

/**
 * 取单个字典项的显示文案（**组件层首选**）。
 *
 * 回落链：当前语言 → `zh-CN` → `fallback` → `value`。
 * 文案表还没加载完（或该分类根本没建文案）时会走 `fallback`，因此调用方应把后端 `label` 传进来。
 */
export function useDictText(
  path?: string | null,
  value?: string | number | null,
  fallback?: string | null,
): string {
  const moduleName = dictModuleOf(path)
  const dictKey = dictKeyOf(path)
  const { data } = useDictMessages(moduleName)

  return useMemo(() => {
    const text = pickDictTextWithFallback(data, dictKey, value)
    if (text) return text
    if (fallback) return fallback
    return value === null || value === undefined ? '' : String(value)
  }, [data, dictKey, value, fallback])
}

/** 字典项（或任何带 `code` / `value` / `label` 的对象）的最小取值形状。 */
export type DictTextSource = {
  /** 分类完整 code，如 `new.user.status`；用于推导 dict path。 */
  code?: string | null
  /** 字典项 value。 */
  value?: string | number | null
  /** 后端给的兜底文案（通常是中文 `label`）。 */
  label?: string | null
}

/**
 * 取一个字典项的文案（hook 版）。
 *
 * 注意：不要在循环 / 不定长度的 map 里调用它 —— 那种场景用 `useDictMessages()` + `pickDictText()`。
 */
export function useDictItemText(item: DictTextSource, fallback?: string | null): string {
  return useDictText(dictPathOf(item.code), item.value, fallback ?? item.label ?? null)
}

/** `useDictText` 的组件形态：给表格渲染器等无法直接调 hook 的地方用。 */
export function DictText({
  path,
  value,
  fallback,
}: {
  path?: string | null
  value?: string | number | null
  fallback?: string | null
}) {
  return <>{useDictText(path, value, fallback)}</>
}

/** 字典项文案的组件形态（表格单元格首选）。 */
export function DictItemText({
  item,
  fallback,
}: {
  item: DictTextSource
  fallback?: string | null
}) {
  return <>{useDictItemText(item, fallback)}</>
}
