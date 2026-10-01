/**
 * i18n 类型说明 —— 这里**刻意不做** `declare module 'i18next'` 增强。
 *
 * 为什么不增强：把精确的键类型接进 i18next 的 `CustomTypeOptions.resources`
 * 后，本仓规模（约 1000 个键）会让 `tsc` 直接 abort（exit 134）。
 * 实测细节与结论写在 `scripts/i18n/gen-types.mjs` 文件头。
 *
 * 现在的做法：
 * - **编译期**：用 `#/lib/use-typed-t` 的 `useT('ns')` 得到类型安全的 `t`，
 *   键名写错会在 `pnpm typecheck` / `pnpm build` 直接报错；
 * - **全仓兜底**：`scripts/i18n/check-keys.mjs --strict` 在 CI 扫描所有
 *   `t('…')` 调用（含存量 900 处），发现「代码用了但源语言没有」的键。
 *
 * 本文件保留为占位，便于将来 i18next 支持轻量键校验时在这里接线。
 */
export {}
