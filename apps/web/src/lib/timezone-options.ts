/**
 * 时区的类型、清单与默认值。
 *
 * 与 `#/lib/locale` 同样的拆分理由：`timezone.ts` 需要读偏好 store，
 * 而偏好 store 需要这里的 `TimezoneKey` 与默认值 —— 抽出来才能避免循环依赖。
 */

/**
 * 支持的时区 Key（与 `SUPPORTED_LOCALES` 的语言一一对应，另加 UTC 基准）：
 * - 'UTC': 0 时区 (UTC+0)
 * - 'Asia/Shanghai': 简体中文 (北京时间 UTC+8)
 * - 'America/New_York': 英语 (美东时间 UTC-5 / 夏令时 UTC-4)
 * - 'Asia/Tokyo': 日语 (东京时间 UTC+9)
 * - 'Asia/Riyadh': 阿拉伯语 (利雅得时间 UTC+3)
 * - 'Asia/Kolkata': 印地语 (印度时间 UTC+5:30)
 * - 'Europe/Madrid': 西班牙语 (马德里时间 UTC+1 / 夏令时 UTC+2)
 * - 'Europe/Istanbul': 土耳其语 (伊斯坦布尔时间 UTC+3)
 */
export type TimezoneKey =
  | 'UTC'
  | 'Asia/Shanghai'
  | 'America/New_York'
  | 'Asia/Tokyo'
  | 'Asia/Riyadh'
  | 'Asia/Kolkata'
  | 'Europe/Madrid'
  | 'Europe/Istanbul'

export interface TimezoneMeta {
  key: TimezoneKey
  iana: string
  labelKey: string
  defaultName: string
}

/**
 * 时区清单（即用户菜单中的展示顺序）：
 * UTC 作为基准置顶，其余按 `SUPPORTED_LOCALES` 的语言顺序排列。
 * 注意：偏移（GMT±X）刻意不写死在清单里 —— 马德里 / 纽约有夏令时，
 * 统一由 `getTimezoneOffsetLabel()` 按当前时刻动态计算。
 */
export const SUPPORTED_TIMEZONES: readonly TimezoneMeta[] = [
  {
    key: 'UTC',
    iana: 'UTC',
    labelKey: 'timezone.options.utc',
    defaultName: '标准',
  },
  {
    key: 'Asia/Shanghai',
    iana: 'Asia/Shanghai',
    labelKey: 'timezone.options.cn',
    defaultName: '本地',
  },
  {
    key: 'America/New_York',
    iana: 'America/New_York',
    labelKey: 'timezone.options.us',
    defaultName: '美国东部',
  },
  {
    key: 'Asia/Tokyo',
    iana: 'Asia/Tokyo',
    labelKey: 'timezone.options.jp',
    defaultName: '日本',
  },
  {
    key: 'Asia/Riyadh',
    iana: 'Asia/Riyadh',
    labelKey: 'timezone.options.saudi',
    defaultName: '沙特',
  },
  {
    key: 'Asia/Kolkata',
    iana: 'Asia/Kolkata',
    labelKey: 'timezone.options.india',
    defaultName: '印度',
  },
  {
    key: 'Europe/Madrid',
    iana: 'Europe/Madrid',
    labelKey: 'timezone.options.es',
    defaultName: '西班牙',
  },
  {
    key: 'Europe/Istanbul',
    iana: 'Europe/Istanbul',
    labelKey: 'timezone.options.tr',
    defaultName: '土耳其',
  },
] as const

export const DEFAULT_TIMEZONE: TimezoneKey = 'Asia/Shanghai'

/** 旧版直接写在 localStorage 的时区键（迁移用）。 */
export const LEGACY_TIMEZONE_STORAGE_KEY = 'admin.timezone'

/** 受支持时区的判定（迁移旧值与持久化数据校验共用）。 */
export function isTimezoneKey(value: unknown): value is TimezoneKey {
  return (
    typeof value === 'string' &&
    SUPPORTED_TIMEZONES.some((item) => item.key === value)
  )
}

/** 取时区元信息，未知 key 一律回落到默认时区（不依赖数组下标）。 */
export function getTimezoneMeta(key: TimezoneKey): TimezoneMeta {
  return (
    SUPPORTED_TIMEZONES.find((item) => item.key === key) ??
    SUPPORTED_TIMEZONES.find((item) => item.key === DEFAULT_TIMEZONE)!
  )
}
