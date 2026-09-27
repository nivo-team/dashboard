# API 客户端与代码生成

> 契约级的硬约束在 `AGENTS.md`；这里是完整说明：契约从哪来、生成链路、
> 响应拦截规则、Query 缓存层的分区与重试策略。

## 契约与生成链路

契约的唯一真值是 `packages/api-contract/openapi.json`。它默认由本地 Mock **反向生成**
（`apps/mock` 里每个路由的 `defineRouteMeta` 声明即契约），也可以切到任意外部来源 ——
见 [packages/api-contract/README.md](../../packages/api-contract/README.md)。

```
apps/mock 的路由（defineRouteMeta）
        │  Nitro 静态提取
        ▼
GET /openapi.json ──pnpm contract──► packages/api-contract/openapi.json
                                              │
                                    pnpm api  │
                                              ▼
                     apps/web/src/api/generated/（SDK / 类型 / schema / Query 产物）
```

`pnpm api` 依次做四件事：同步契约 → `openapi-ts` 生成 SDK → 生成筛选字段目录 → 生成接口参数索引。

- **来源切换**：改 `contract.config.json`，或用环境变量临时覆盖
  （`API_SPEC_SOURCE` / `API_SPEC_URL` / `API_SPEC_FILE` / `APIFOX_PROJECT_ID`）；
- **生成产物** `apps/web/src/api/generated/` **不要手改**；
- **Hey API 插件链**：`@hey-api/client-ofetch` + `typescript` + `sdk` + `schemas` + `@tanstack/react-query`。
  queryOptions 统一加 `QueryOptions` 后缀，避免与同名 SDK 方法冲突。

## 响应拦截（`apps/web/src/api/index.ts`）

- **HTTP 401** → 调 `unauthorizedHandler` 清理状态并跳登录页，**处理完直接 return**（不再走业务码判断）；
- **HTTP 200 但 `code !== 0` → 业务失败**：`notifyApiError(message)` 弹全局 toast（同文案短时间内去重），
  并抛出 `ApiError`，让 mutation 走失败分支（不会误关弹窗 / 误刷新）、query 进 error 状态。
  契约里所有接口都用 `200 + code` 表达成败，所以这个拦截是必需的；
- 只有 `typeof code === 'number'` 才判定，字符串码或非 JSON 响应（下载等）原样放行；
- 请求拦截只做两件事：附加 `Authorization: Bearer` 与 `X-App-Id`。
  （历史上有过一道 `/api/api/` 路径重写 —— 那是 baseUrl 与契约路径都带 `/api` 导致的，
  现在契约路径本身就是完整的，重写逻辑已删除。）

## 非 React 上下文的 toast

`apps/web/src/lib/toast.ts` 用 `createKumoToastManager()` 建了模块级实例 `appToastManager`，
在 `__root.tsx` 里挂载。API 拦截器等 React 之外的代码必须走它，才能与组件内
`useKumoToastManager()` 共用同一个队列。

## Query 缓存层

- **按应用分区**：`apps/web/src/lib/query-client.ts` 的 `getQueryClient(scope)`，每个 app 一份
  `QueryClient`，由 `app-query-client-provider.tsx` 按当前作用域提供给外层；
- **只有身份边界清缓存**：登录、登出、换账号用 `clearAllQueryCaches()`；
  **切换应用不要清** —— 各应用缓存已物理隔离，清掉等于放弃「切回来即时可见」（见 [./store.md](./store.md)）；
- **业务错误不重试**：`retry` 用 `isApiError(error)` 判定，`code !== 0` 直接放弃，其余失败重试 1 次；
- 取数用 `useQuery(getXxxQueryOptions())` / `useMutation(xxxMutation())`，不要再手写
  `useEffect` + `setState`；无参数的 queryOptions 也要**以函数调用形式**传入。

## 运行时 JSON Schema

`schemas.gen.ts` 内含 `#/components/schemas` 的运行时对象（`userItemSchema`、`menuNodeSchema`
这类 `as const` 常量），供表格列自动编排（`useSchemaColumns`）使用。
**只按需 import 具体 schema**，未被引用的部分会被 tree-shaking 移除。

## 导入规范

业务组件与页面统一从 `#/api` 导入：

```ts
import { client, getUserQueryOptions } from '#/api'
import type { UserItem } from '#/api'
```

## 各模块的数据层

| 模块 | 接口 | 说明 |
| --- | --- | --- |
| 功能菜单 | `GET /system/menu/tree` | 返回**顶层节点数组**，后代嵌在各自的 `children` 里 |
| 数据字典 | `/data_dict`、`/data_dict/type/tree`、`/data_dict/options` | 契约已如实声明 `{ total, items }` 与分类树，**不需要模块自声明响应类型** |
| 用户 | `GET /user` | 服务端分页，支持 `kw` 搜索 |

这些接口全部由 `apps/mock` 提供，字段与契约一一对应。要改接口：先改 mock 的路由
（**定义即契约**），再跑 `pnpm api` 重新生成前端 SDK。
