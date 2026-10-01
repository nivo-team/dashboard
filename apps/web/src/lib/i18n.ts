import i18n from 'i18next'
import type { Resource } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LOCALE_LOCK, SUPPORTED_LOCALES, type LocaleKey } from './locale'
import { usePreferencesStore } from './store/preferences-store'

/**
 * 语言清单与类型定义放在 `#/lib/locale`（独立文件，用于打破与偏好 store 的循环依赖），
 * 这里再导出一次，保持 `#/lib/i18n` 的既有用法不变。
 */
export { SUPPORTED_LOCALES, type LocaleKey, type LocaleMeta } from './locale'

/**
 * 利用 Vite 的 import.meta.glob 自动扫描 messages 目录下的所有语言文件：
 * 规则：/src/messages/{module}/{lang}.json
 * 提取 module 作为 namespace，提取文件名作为语言 key，完全实现零配置自动注册！
 */
const localeModules = import.meta.glob<Record<string, unknown>>(
  '/src/messages/*/*.json',
  {
    eager: true,
    import: 'default',
  },
)

const resources: Resource = {}

for (const path in localeModules) {
  const match = path.match(/\/messages\/([^/]+)\/([^/]+)\.json$/)
  if (match) {
    const [, moduleName, langKey] = match
    resources[langKey] = resources[langKey] || {}
    resources[langKey][moduleName] = localeModules[path] as any
  }
}

/**
 * 初始语言：开发期锁定值优先（见 `#/lib/locale` 的 `LOCALE_LOCK`），
 * 否则取偏好 store。
 *
 * store 用同步 storage（localStorage）水合，模块加载完成时已经是用户的真实选择，
 * 因此这里不需要再单独读一次 localStorage（旧键的迁移由 preferences-store 负责）。
 */
const initialLocale = LOCALE_LOCK ?? usePreferencesStore.getState().locale

i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false, // React 已经自带 XSS 保护
  },
})

/**
 * 切换语言：只写偏好 store（**单一真值**）。
 *
 * i18n 实例由下方订阅同步，所以设置页 / 用户菜单 / 命令面板等任何入口
 * 只要改 store 就会生效，不存在第二处写状态的地方。
 */
export function changeAppLanguage(lang: LocaleKey) {
  usePreferencesStore.getState().setLocale(lang)
}

// 偏好 store → i18next 的单向同步。
usePreferencesStore.subscribe((state, prevState) => {
  if (state.locale !== prevState.locale) {
    void i18n.changeLanguage(state.locale)
  }
})

// 首帧兜底：React 挂载前先把 <html> 的 lang / dir 设好，避免闪一下错误方向；
// 之后由 AppRootLayout 跟着 useLocale() 同步（见该文件注释）。
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale
  const initialMeta = SUPPORTED_LOCALES.find((item) => item.key === initialLocale)
  document.documentElement.dir = initialMeta?.dir || 'ltr'
}

export default i18n
