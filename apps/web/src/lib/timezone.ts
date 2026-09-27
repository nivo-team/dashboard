import { usePreferencesStore } from './store/preferences-store'
import {
  DEFAULT_TIMEZONE,
  getTimezoneMeta as resolveTimezoneMeta,
  LEGACY_TIMEZONE_STORAGE_KEY,
  SUPPORTED_TIMEZONES,
  type TimezoneKey,
  type TimezoneMeta,
} from './timezone-options'

/**
 * 时区状态与时间格式化工具。
 *
 * 状态的**单一真值**在偏好 store（`#/lib/store/preferences-store` 的 `timezone`），
 * 类型、清单与默认值在 `#/lib/timezone-options`（独立文件，用于打破循环依赖）。
 * 本文件负责：对外暴露既有 API（`getTimezone` / `setTimezone` / `useTimezone`）
 * 以及全站统一的时间格式化函数。
 */
export {
  DEFAULT_TIMEZONE,
  SUPPORTED_TIMEZONES,
  type TimezoneKey,
  type TimezoneMeta,
}

/** 旧版时区 localStorage 键（已被 `admin.preferences` 取代），保留导出仅为兼容。 */
export const TIMEZONE_STORAGE_KEY = LEGACY_TIMEZONE_STORAGE_KEY

export type DateInput = string | number | Date | null | undefined

/** 当前生效时区。 */
export function getTimezone(): TimezoneKey {
  return usePreferencesStore.getState().timezone
}

/** 取时区元信息，未指定 key 时用当前生效时区（未知 key 一律回落默认时区）。 */
export function getTimezoneMeta(key: TimezoneKey = getTimezone()): TimezoneMeta {
  return resolveTimezoneMeta(key)
}

/** 切换时区：只写偏好 store，落盘与组件重渲染都由 store 负责。 */
export function setTimezone(tz: TimezoneKey) {
  usePreferencesStore.getState().setTimezone(tz)
}

export function parseDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

interface DateParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

function getDateParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const map: Record<string, string> = {}
  for (const part of parts) {
    map[part.type] = part.value
  }

  return {
    year: map.year ?? '1970',
    month: map.month ?? '01',
    day: map.day ?? '01',
    hour: map.hour ?? '00',
    minute: map.minute ?? '00',
    second: map.second ?? '00',
  }
}

/** 把偏移分钟数格式化为 'UTC' / 'GMT+8' / 'GMT+5:30' / 'GMT-4'。 */
function formatOffsetLabel(minutes: number): string {
  if (minutes === 0) return 'UTC'
  const sign = minutes > 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const hour = Math.floor(abs / 60)
  const minute = abs % 60
  return minute === 0
    ? `GMT${sign}${hour}`
    : `GMT${sign}${hour}:${String(minute).padStart(2, '0')}`
}

/** 计算指定时区相对 UTC 的偏移分钟数（含夏令时，印度等半小时时区会返回 330）。 */
function getOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getDateParts(date, timeZone)
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUTC - date.getTime()) / 60000)
}

/**
 * 时区偏移标签缓存：粒度是「IANA 时区 + 本地日期」，
 * 避免表格批量格式化时间时反复做 Intl 计算（夏令时按天粒度已足够）。
 */
const offsetLabelCache = new Map<string, string>()

/**
 * 时区偏移标签（例如 'UTC' / 'GMT+8' / 'GMT+5:30' / 'GMT-4'）：
 * 用于 `includeTimezone` 后缀、`[TZ]` 模板占位以及时区菜单展示。
 * 夏令时地区（马德里 / 纽约）会随时间自动切换，不要改成写死的静态字符串。
 */
export function getTimezoneOffsetLabel(
  key: TimezoneKey = getTimezone(),
  date: Date = new Date(),
): string {
  const iana = getTimezoneMeta(key).iana
  const cacheKey = `${iana}|${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const cached = offsetLabelCache.get(cacheKey)
  if (cached) return cached

  const label = formatOffsetLabel(getOffsetMinutes(date, iana))
  offsetLabelCache.set(cacheKey, label)
  return label
}

export interface DateTimeFormatOptions {
  /** 覆盖指定时区，默认采用当前全局激活的时区 */
  timeZone?: TimezoneKey
  /** 是否包含秒，默认 true (即 YYYY-MM-DD HH:mm:ss) */
  includeSeconds?: boolean
  /** 是否展示时区后缀（例如 " (UTC+8)"），默认 false */
  includeTimezone?: boolean
  /** 兜底占位符（当输入为 null/undefined 或无效日期时），默认 '-' */
  fallback?: string
}

/**
 * 统一时间格式化核心函数：
 * 全站未来的时间全部强制使用此函数或其派生工具进行显示。
 * 默认格式：YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime(
  value: DateInput,
  options?: DateTimeFormatOptions,
): string {
  const date = parseDate(value)
  if (!date) return options?.fallback ?? '-'

  const tzKey = options?.timeZone ?? getTimezone()
  const tzMeta = getTimezoneMeta(tzKey)
  const parts = getDateParts(date, tzMeta.iana)

  const datePart = `${parts.year}-${parts.month}-${parts.day}`
  const timePart =
    options?.includeSeconds === false
      ? `${parts.hour}:${parts.minute}`
      : `${parts.hour}:${parts.minute}:${parts.second}`

  const suffix = options?.includeTimezone ? ` (${getTimezoneOffsetLabel(tzKey)})` : ''
  return `${datePart} ${timePart}${suffix}`
}

export interface DateFormatOptions {
  timeZone?: TimezoneKey
  fallback?: string
}

/**
 * 格式化年月日（在指定时区下计算）：
 * 默认格式：YYYY-MM-DD
 */
export function formatDate(
  value: DateInput,
  options?: DateFormatOptions,
): string {
  const date = parseDate(value)
  if (!date) return options?.fallback ?? '-'

  const tzKey = options?.timeZone ?? getTimezone()
  const tzMeta = getTimezoneMeta(tzKey)
  const parts = getDateParts(date, tzMeta.iana)

  return `${parts.year}-${parts.month}-${parts.day}`
}

export interface TimeFormatOptions {
  timeZone?: TimezoneKey
  includeSeconds?: boolean
  includeTimezone?: boolean
  fallback?: string
}

/**
 * 格式化时分秒（在指定时区下计算）：
 * 默认格式：HH:mm:ss（若 includeSeconds 为 false 则为 HH:mm）
 */
export function formatTime(
  value: DateInput,
  options?: TimeFormatOptions,
): string {
  const date = parseDate(value)
  if (!date) return options?.fallback ?? '-'

  const tzKey = options?.timeZone ?? getTimezone()
  const tzMeta = getTimezoneMeta(tzKey)
  const parts = getDateParts(date, tzMeta.iana)

  const timePart =
    options?.includeSeconds === false
      ? `${parts.hour}:${parts.minute}`
      : `${parts.hour}:${parts.minute}:${parts.second}`

  const suffix = options?.includeTimezone ? ` (${getTimezoneOffsetLabel(tzKey)})` : ''
  return `${timePart}${suffix}`
}

export interface InTimezoneOptions {
  timeZone?: TimezoneKey
  fallback?: string
}

/**
 * 支持自定义模版的时间格式化：
 * 支持占位符：YYYY (年), MM (月), DD (日), HH (24小时制时), mm (分), ss (秒), [TZ] (时区偏移)
 */
export function formatInTimezone(
  value: DateInput,
  pattern: string = 'YYYY-MM-DD HH:mm:ss',
  options?: InTimezoneOptions,
): string {
  const date = parseDate(value)
  if (!date) return options?.fallback ?? '-'

  const tzKey = options?.timeZone ?? getTimezone()
  const tzMeta = getTimezoneMeta(tzKey)
  const parts = getDateParts(date, tzMeta.iana)

  return pattern
    .replace(/YYYY/g, parts.year)
    .replace(/MM/g, parts.month)
    .replace(/DD/g, parts.day)
    .replace(/HH/g, parts.hour)
    .replace(/mm/g, parts.minute)
    .replace(/ss/g, parts.second)
    .replace(/\[TZ\]/g, getTimezoneOffsetLabel(tzKey))
}

export interface RelativeFormatOptions {
  fallback?: string
  locale?: string
}

/**
 * 相对时间格式化（例如「3 小时前」或「3 hours ago」）：
 */
export function formatRelative(
  value: DateInput,
  options?: RelativeFormatOptions,
): string {
  const date = parseDate(value)
  if (!date) return options?.fallback ?? '-'

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ]

  const locale =
    options?.locale ??
    ((typeof document !== 'undefined' ? document.documentElement.lang : 'zh-CN') ||
      'zh-CN')

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSeconds) >= secondsInUnit || unit === 'second') {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit)
    }
  }

  return '刚刚'
}

/**
 * 时区管理 Hook：
 * 自动订阅偏好 store 的时区变更，并在时区切换时驱动使用本 Hook 的组件即时重渲染。
 */
export function useTimezone() {
  const timezone = usePreferencesStore((state) => state.timezone)
  const timezoneMeta = getTimezoneMeta(timezone)

  return {
    timezone,
    timezoneMeta,
    setTimezone,
    supportedTimezones: SUPPORTED_TIMEZONES,
    /** 当前时区的动态偏移标签（如 'GMT+8'，夏令时地区会自动切换） */
    offsetLabel: getTimezoneOffsetLabel(timezone),
    getTimezoneOffsetLabel,
    formatDateTime: (value: DateInput, options?: DateTimeFormatOptions) =>
      formatDateTime(value, { timeZone: timezone, ...options }),
    formatDate: (value: DateInput, options?: DateFormatOptions) =>
      formatDate(value, { timeZone: timezone, ...options }),
    formatTime: (value: DateInput, options?: TimeFormatOptions) =>
      formatTime(value, { timeZone: timezone, ...options }),
    formatRelative,
    formatInTimezone: (value: DateInput, pattern?: string, options?: InTimezoneOptions) =>
      formatInTimezone(value, pattern, { timeZone: timezone, ...options }),
  }
}
