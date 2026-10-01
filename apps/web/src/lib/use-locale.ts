import {
  LOCALE_LOCK,
  SUPPORTED_LOCALES,
  type LocaleKey,
  type LocaleMeta,
} from './locale'
import { usePreferencesStore } from './store/preferences-store'

export type { LocaleKey, LocaleMeta }
export { SUPPORTED_LOCALES }

/**
 * 语言状态 Hook：对外仍是「读当前语言 + 切换语言」两个能力，
 * 但真值来自偏好 store（`#/lib/store/preferences-store`），
 * 不再直接读 `i18n.language` —— store 变化时组件自动重渲染，
 * 而 i18next 实例由 `i18n.ts` 的订阅同步。
 *
 * **开发期语言锁定**：设了 `VITE_I18N_LOCK_LOCALE` 时（见 `#/lib/i18n`），
 * 语言固定为锁定值、`setLocale` 变成空操作，切换入口应据此隐藏。
 */
export function useLocale() {
  const storeLocale = usePreferencesStore((state) => state.locale)
  const locale = LOCALE_LOCK ?? storeLocale

  const currentMeta =
    SUPPORTED_LOCALES.find((item) => item.key === locale) ??
    SUPPORTED_LOCALES[0]

  const dir = currentMeta.dir ?? 'ltr'
  const isRtl = dir === 'rtl'

  return {
    locale,
    currentMeta,
    dir,
    isRtl,
    /** 语言切换是否被开发期开关锁定。 */
    isLocaleLocked: LOCALE_LOCK !== null,
    supportedLocales: SUPPORTED_LOCALES,
    setLocale: (next: LocaleKey) => {
      // 锁定期间不接受切换，避免出现「点了但界面不变」的假开关
      if (LOCALE_LOCK !== null) return
      usePreferencesStore.getState().setLocale(next)
    },
  }
}
