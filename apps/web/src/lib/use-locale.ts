import {
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
 */
export function useLocale() {
  const locale = usePreferencesStore((state) => state.locale)

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
    supportedLocales: SUPPORTED_LOCALES,
    setLocale: (next: LocaleKey) => {
      usePreferencesStore.getState().setLocale(next)
    },
  }
}
