/**
 * 语言（locale）的类型、清单与浏览器默认值推断。
 *
 * 单独成文件是为了打破 `i18n.ts` ↔ 偏好 store 的循环依赖：
 * i18n 初始化需要 store 里保存的用户选择，而 store 又需要这里定义的 `LocaleKey`。
 */

export type LocaleKey =
  | 'zh-CN'
  | 'en-US'
  | 'ja-JP'
  | 'ar-SA'
  | 'hi-IN'
  | 'es-ES'
  | 'tr-TR'

export interface LocaleMeta {
  key: LocaleKey
  label: string
  nativeName: string
  dir?: 'ltr' | 'rtl'
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { key: 'zh-CN', label: '简体中文', nativeName: '简体中文' },
  { key: 'en-US', label: 'English', nativeName: 'English' },
  { key: 'ja-JP', label: '日本語', nativeName: '日本語' },
  { key: 'ar-SA', label: 'العربية', nativeName: 'العربية', dir: 'rtl' },
  { key: 'hi-IN', label: 'हिन्दी', nativeName: 'हिन्दी' },
  { key: 'es-ES', label: 'Español', nativeName: 'Español' },
  { key: 'tr-TR', label: 'Türkçe', nativeName: 'Türkçe' },
]

/**
 * 旧版直接写在 localStorage 的语言键。
 *
 * 偏好统一收进 `admin.preferences`（见 `#/lib/store/preferences-store`）后它只用于一次性迁移。
 */
export const LEGACY_LOCALE_STORAGE_KEY = 'admin.locale'

/** 受支持语言的判定（迁移旧值与持久化数据校验共用）。 */
export function isLocaleKey(value: unknown): value is LocaleKey {
  return (
    typeof value === 'string' &&
    SUPPORTED_LOCALES.some((item) => item.key === value)
  )
}

/** 按浏览器语言推断初始语言：用户从未主动选择过时的兜底。 */
export function getBrowserLocale(): LocaleKey {
  if (typeof window === 'undefined') return 'zh-CN'
  const browserLang = window.navigator.language
  if (browserLang.startsWith('en')) return 'en-US'
  if (browserLang.startsWith('ja')) return 'ja-JP'
  if (browserLang.startsWith('ar')) return 'ar-SA'
  if (browserLang.startsWith('hi')) return 'hi-IN'
  if (browserLang.startsWith('es')) return 'es-ES'
  if (browserLang.startsWith('tr')) return 'tr-TR'
  return 'zh-CN'
}
