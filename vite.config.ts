import { defineConfig } from 'vite-plus'

/**
 * Vite+ 工作区根配置（工具链唯一入口）。
 *
 * 这里只放**跨包共享**的静态检查配置，不放构建配置 —— 各 app 自己的
 * `vite.config.ts` 才管 dev/build。`vp check` / `vp fmt` / `vp lint`
 * 一律从工作区根读本文件的 `fmt` / `lint` 块（包内同名块不会覆盖它）。
 */
export default defineConfig({
  fmt: {
    // 引号与分号对齐仓库既有习惯（单引号、行尾无分号）；宽度用 oxfmt 默认的 100 —— 仓库里
    // 本就有大量 80~100 列的手写长行，收窄到 80 只会制造无谓换行。
    singleQuote: true,
    semi: false,
    printWidth: 100,
    // 手写文档中英文混排、按语义手工折行，交给作者而不是格式化器；
    // 生成物（契约 SDK、路由树）每次重新生成都会被覆盖，格式化只会制造无意义 diff。
    ignorePatterns: [
      '**/*.md',
      'packages/api-client/src/generated/**',
      '**/*.gen.ts',
      'packages/api-client/openapi.json',
    ],
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      'packages/api-client/src/generated/**',
      '**/*.gen.ts',
      'packages/api-client/openapi.json',
    ],
  },
})
