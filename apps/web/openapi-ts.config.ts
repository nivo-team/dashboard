import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../packages/api-contract/openapi.json',
  output: {
    path: './src/api/generated',
  },
  plugins: [
    // HTTP 客户端：ofetch（自动解析响应体，保留原生 onRequest / onResponse 钩子能力）
    '@hey-api/client-ofetch',
    '@hey-api/typescript',
    '@hey-api/sdk',
    // 生成运行时 JSON Schema（schemas.gen.ts），供表格列自动编排与后续表单校验复用
    {
      name: '@hey-api/schemas',
      type: 'json',
    },
    // TanStack Query v5（React）：生成 queryOptions / mutationOptions / queryKey，
    // 为所有接口提供统一缓存层（接入方式见 src/lib/query-client.ts）。
    //
    // queryOptions 命名统一加 `QueryOptions` 后缀：默认的 `{{name}}Options` 会与
    // 业务里同名的 SDK 方法冲突（实测 getDataDictOptions / getSystemRoleOptions），
    // 导致 src/api/index.ts 的 `export *` 出现 TS2308 歧义。
    {
      name: '@tanstack/react-query',
      queryOptions: {
        name: '{{name}}QueryOptions',
      },
    },
  ],
});
