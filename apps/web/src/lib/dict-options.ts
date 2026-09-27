import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDataDictOptionsQueryOptions } from '#/api'
import type { DictOption as ApiDictOption } from '#/api'
import { dictKeyOf, dictModuleOf, stripDictNamespace } from './dict-key'
import { pickDictTextWithFallback, useDictMessages } from './dict-messages'

/**
 * 字典选项（`GET /data_dict/options`）的获取入口。
 *
 * ## 接口特征
 *
 * - **无参数、一次全量**：返回 `{ [分类code]: DictOption[] }`，一次拿到所有分类的选项，
 *   所以进入应用时预取一次、全应用共享（见 `src/routes/$appId/route.tsx`）；
 * - 选项形态：`{ label, value, disabled, other: { is_default, remark } }`；
 * - key 就是逻辑 key（`user.status`），业务直接用它取值：`useDictOptionList('user.status')`。
 *
 * ## 与字典文案（messages/dict）的分工
 *
 * | 来源 | 提供 | 语言 |
 * | --- | --- | --- |
 * | 本文件（`/data_dict/options`） | 选项的存在性、顺序、`disabled`、`is_default`、`remark`，以及 **label 中文兜底** | 单语言 |
 * | `#/lib/dict-messages` | 各语言显示文案 | 多语言 |
 *
 * 显示文案的优先级因此是：**字典文案（当前语言）→ options.label → value**。
 */

/** 选项缓存时长：字典改动不频繁，但希望改完能较快生效，取 10 分钟。 */
const DICT_OPTIONS_STALE_TIME = 10 * 60_000

/** 规范化后的选项（把后端 `unknown` 字段收窄成可用形态）。 */
export type DictOption = {
  /** 选项值（业务使用的枚举值，如 `normal`）。 */
  value: string
  /** 显示文本（后端单语言版本，通常为中文）。 */
  label: string
  /** 是否禁用（筛选 / 下拉候选时使用）。 */
  disabled: boolean
  /** 是否默认项（来自 `other.is_default`）。 */
  isDefault: boolean
  /** 备注（来自 `other.remark`）。 */
  remark: string
}

/** 逻辑 key（`user.status`）→ 选项列表。 */
export type DictOptionMap = Record<string, DictOption[]>

const EMPTY_OPTIONS: readonly DictOption[] = []

function toBooleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function normalizeOption(raw: ApiDictOption): DictOption | null {
  const rawValue = raw.value
  // 选项值必须能当标量用；对象 / 空值直接跳过，避免污染候选列表
  if (rawValue === null || rawValue === undefined) return null
  if (typeof rawValue === 'object') return null

  const value = String(rawValue)
  const other = (raw.other ?? {}) as Record<string, unknown>

  return {
    value,
    label: typeof raw.label === 'string' && raw.label ? raw.label : value,
    disabled: raw.disabled === true,
    isDefault: toBooleanFlag(other.is_default),
    remark: typeof other.remark === 'string' ? other.remark : '',
  }
}

/**
 * 把接口返回的原始映射转成「逻辑 key → 选项」。
 *
 * **历史命名空间的数据在这里被丢弃**（`stripDictNamespace` 返回 `null`），
 * 因此调用方拿到的 key 一定是不带 `new.` 的逻辑 key。
 */
export function normalizeDictOptions(
  raw?: Record<string, ApiDictOption[]> | null,
): DictOptionMap {
  const map: DictOptionMap = {}
  if (!raw) return map

  for (const rawKey in raw) {
    const logicalKey = stripDictNamespace(rawKey)
    if (!logicalKey) continue

    const list = raw[rawKey]
    if (!Array.isArray(list)) continue

    map[logicalKey] = list
      .map(normalizeOption)
      .filter((item): item is DictOption => item !== null)
  }

  return map
}

/**
 * 全量字典选项（已剥掉临时命名空间、已过滤历史数据）。
 *
 * 进入应用时由 `$appId` 外壳预取一次，业务模块直接调用即可命中缓存。
 */
export function useDictOptions() {
  const query = useQuery({
    ...getDataDictOptionsQueryOptions(),
    staleTime: DICT_OPTIONS_STALE_TIME,
  })

  const options = useMemo(
    () => normalizeDictOptions(query.data?.result),
    [query.data],
  )

  return {
    /** 逻辑 key → 选项；接口未返回时为空对象。 */
    options,
    /** 首次加载中（预取未完成）。 */
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * 取某个分类的选项列表（**业务首选**）：`useDictOptionList('user.status')`。
 *
 * 分类不存在或接口未就绪时返回空数组，调用方按「空列表」处理即可。
 */
export function useDictOptionList(path: string): readonly DictOption[] {
  const { options } = useDictOptions()
  return options[path] ?? EMPTY_OPTIONS
}

/** 取某个分类下指定值的选项（找不到返回 `undefined`）。 */
export function useDictOption(
  path: string,
  value?: string | number | null,
): DictOption | undefined {
  const list = useDictOptionList(path)
  if (value === null || value === undefined) return undefined
  return list.find((item) => item.value === String(value))
}

/** 选项 + 已解析的显示文案（当前语言）。 */
export type DictOptionEntry = DictOption & {
  /** 显示文案：字典文案（当前语言）→ `options.label`；不含「回落 value」这一步。 */
  text: string
}

const EMPTY_ENTRIES: readonly DictOptionEntry[] = []

/**
 * 取某个分类的选项并解析出**当前语言**的显示文案：
 * `useDictOptionEntries('user.status')`。
 *
 * 与 `useDictOptionList` 的区别：多一步 value → 文案的解析（字典文案 → options.label）。
 * 适合「渲染标签」的场景 —— 筛选器的候选项、已选条件的 chip 等。
 * 顺序与后端一致；`disabled` 原样保留，由调用方决定是否过滤。
 */
export function useDictOptionEntries(path: string): readonly DictOptionEntry[] {
  const options = useDictOptionList(path)
  const moduleName = dictModuleOf(path)
  const dictKey = dictKeyOf(path)
  const { data: dictMessages } = useDictMessages(moduleName)

  return useMemo(() => {
    if (options.length === 0) return EMPTY_ENTRIES
    return options.map((option) => ({
      ...option,
      text:
        pickDictTextWithFallback(dictMessages, dictKey, option.value) ??
        option.label,
    }))
  }, [options, dictMessages, dictKey])
}

/**
 * 从选项列表里取 label（纯函数，可在循环里安全调用 —— 循环中不要调 hook）。
 */
export function pickDictOptionLabel(
  options: readonly DictOption[],
  value?: string | number | null,
): string | undefined {
  if (value === null || value === undefined) return undefined
  const target = String(value)
  return options.find((item) => item.value === target)?.label
}

/**
 * 显示文案的统一回落链（组件层首选）：
 *
 * `字典文案（当前语言）→ options.label → value`
 *
 * 多语言文案由 `#/lib/dict-messages` 提供，本函数不重复实现它的回落，
 * 只负责把「文案取不到时用 options.label 兜底」这一步固定下来。
 */
export function pickDictOptionText(
  options: readonly DictOption[],
  value?: string | number | null,
  localizedText?: string | null,
): string {
  if (localizedText) return localizedText
  const label = pickDictOptionLabel(options, value)
  if (label) return label
  return value === null || value === undefined ? '' : String(value)
}
