/**
 * 类型安全的翻译函数：`useT('example')` 的 `t` 只接受该命名空间真实存在的键。
 *
 * ## 为什么需要它
 *
 * 本仓有 900 多处 `t('…')` 调用。i18next 默认的类型是宽松的 ——
 * 键名拼错（`t('sumbit')`）、命名空间写错（`t('features:quota')`）
 * 都要等到界面上显示出一串键名才被发现。
 *
 * ## 为什么不用 i18next 内置的 resources 类型
 *
 * 试过：把 1000 个键的精确嵌套 `resources` 接进 `CustomTypeOptions` 后，
 * `tsc --noEmit` 直接 abort（exit 134）。实测崩溃边界在「单命名空间 312 键可用、
 * 全量 1002 键崩溃」之间，且与模板字面量类型无关。
 * 详见 `scripts/i18n/gen-types.mjs` 文件头。
 *
 * 因此改走**扁平键联合**：键类型由 `#/i18n-keys.gen` 生成，
 * 这里只负责把它接到 i18next 的 `t` 上。实测 33 秒、零崩溃、错误可被拦住。
 *
 * ## 用法
 *
 * ```tsx
 * const t = useT('example')
 * t('columns.nickname')      // ✅ 编译期通过
 * t('columns.nicknameX')     // ❌ 编译期报错
 * t(`cell.${kind}`)          // ✅ 动态前缀白名单（i18n.config.json）
 * ```
 *
 * ## 与 `check-keys.mjs` 的分工
 *
 * 这个 hook 是**编译期**约束，需要新代码主动使用它；
 * 存量 900 处调用由 `node scripts/i18n/check-keys.mjs --strict` 在 CI 里兜底。
 * 两者配合：新代码写错立刻红，存量代码改动时也会被脚本扫出来。
 */
import { useTranslation } from 'react-i18next'
import type { TOptions } from 'i18next'
import type { I18nKeysOf, I18nNamespace } from '#/i18n-keys.gen'

/** 类型化的翻译函数。 */
export type TypedTFunction<N extends I18nNamespace> = (
  key: I18nKeysOf<N>,
  options?: TOptions,
) => string

/**
 * 取某命名空间下的类型安全 `t`。
 *
 * 说明：内部对 i18next 的 `t` 做一次类型断言 —— 这是**刻意的**：
 * 键的正确性由 `I18nKeysOf<N>` 在调用处保证，而不是靠 i18next 的推导。
 */
export function useT<N extends I18nNamespace>(namespace: N): TypedTFunction<N> {
  const { t } = useTranslation(namespace)
  return t as unknown as TypedTFunction<N>
}
