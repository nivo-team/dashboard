# @admin/api-client

整个仓库的 **OpenAPI 契约唯一真值**，以及**由它生成并导出的 API 客户端**。

它同时持有同一份契约的两种形态：

| 形态 | 位置 | 谁维护 |
| --- | --- | --- |
| 契约真值 | `openapi.json` | `scripts/sync.mjs` 从 mock / url / file / apifox 同步 |
| 生成产物 | `src/generated/`、`src/query-params.gen.ts`、`src/endpoint-specs.gen.ts` | `pnpm api` 生成，**不要手改** |

各应用（`apps/web` 及将来的新 app）**不各自生成**，只 import 这个包：

```ts
import { client, getUserQueryOptions, type UserItem } from '@admin/api-client'
// 体积大、按需使用的索引走子路径懒加载
const { ENDPOINT_SPECS } = await import('@admin/api-client/endpoint-specs')
```

本地 Mock（`apps/mock/`）默认按它反向产出，两者都不依赖任何私有后端。

## 为什么抽成一个包

生成链路（`openapi-ts` 配置 + 三个派生脚本）与产物都收在这里，好处是：

- **换后端只有一个落点**：同步契约 → 重新生成 → 所有 app 的调用处立刻按新类型报错；
- **多 app 复用**：新 app 只需 `"@admin/api-client": "workspace:*"`，
  不再复制一份 `openapi-ts.config.ts` 与生成脚本；
- **应用侧只剩薄封装**：baseUrl、鉴权标头、401 跳转、错误提示这些「应用特有的行为」
  留在各 app 里（`apps/web/src/api/index.ts`），通用部分全部下沉到这里。

## 包内结构

```
packages/api-client/
├── contract.config.json      # 契约来源配置
├── openapi.json              # 契约真值（生成物，勿手改）
├── openapi-ts.config.ts      # openapi-ts 插件链配置
├── scripts/
│   ├── sync.mjs              # 同步契约（换后端入口）
│   ├── pull-apifox.js        # Apifox 导出（sync.mjs 的 source=apifox 分支调用）
│   ├── gen-query-params.js   # openapi → 可筛选 query 参数目录
│   └── gen-endpoint-specs.js # openapi → 接口参数索引（给 AI 用）
└── src/
    ├── index.ts              # 公共导出面（各 app 只 import 这个）
    ├── query-filters.ts      # 筛选条件 → query 参数的纯函数
    ├── query-params.gen.ts   # 派生：筛选字段目录（当前取 GET /user）
    ├── endpoint-specs.gen.ts # 派生：接口参数索引（子路径懒加载）
    └── generated/            # openapi-ts 产物：SDK / 类型 / JSON Schema / Query options
```

> `src/generated/` 由 `openapi-ts` **整体清空重建**，所以两个派生脚本刻意写到 `src/` 根下，
> 不放进 `src/generated/`。

## 契约从哪来

`contract.config.json` 决定来源，四种可选：

| `source` | 含义 | 需要填 |
| --- | --- | --- |
| `mock`（默认） | 从本地 Nitro Mock 反向生成的契约拉取 | `mock.url` |
| `url` | 从任意远端 OpenAPI 地址拉取 | `url` |
| `file` | 用仓库内已有的一份契约文件 | `file` |
| `apifox` | 走 Apifox CLI 导出 | `apifox.projectId` |

```bash
# 按配置同步（默认：先确保 pnpm mock 已启动）
pnpm contract
```

## 换成你自己的后端

这是「把模板接到真实后端」的全部步骤：

```bash
# 1. 改来源（也可以只改 contract.config.json）
API_SPEC_SOURCE=url API_SPEC_URL=https://your-api.example.com/openapi.json pnpm contract

# 2. 重新生成 SDK + 派生产物（包内生成，各 app 直接受益）
pnpm api      # = pnpm contract && pnpm -C packages/api-client api

# 3. 把前端指向你的服务
echo 'VITE_API_BASE_URL=https://your-api.example.com/api' > apps/web/.env.local
```

第 2 步之后**类型不匹配的地方会直接编译报错** —— 这正是它的价值：
契约和代码对不上的地方会被立刻指出来，而不是等到运行时才发现。

> 契约版本目前是 **OpenAPI 3.1**（Nitro 生成的格式）。如果你的后端导出的是 3.0，
> 一般可以直接用；若遇到 `nullable` 之类的 3.0 专有写法，先在上游转成 3.1 再同步。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm contract` | 按配置同步 `openapi.json` |
| `pnpm -C packages/api-client generate` | 只跑 `openapi-ts`（SDK / 类型 / schema / Query 产物） |
| `pnpm -C packages/api-client gen:query-params` | 只重生成筛选字段目录 |
| `pnpm -C packages/api-client gen:endpoint-specs` | 只重生成接口参数索引 |
| `pnpm -C packages/api-client api` | 上面三个按序执行 |
| `pnpm -C packages/api-client typecheck` | 包内类型检查 |

## 环境变量

都只影响 `sync.mjs` 的这一次执行，不写回配置文件（方便 CI 里临时切换）：

| 变量 | 作用 |
| --- | --- |
| `API_SPEC_SOURCE` | 覆盖 `source` |
| `API_SPEC_URL` | 覆盖 `url`（`source=mock` 时覆盖 `mock.url`） |
| `API_SPEC_FILE` | 覆盖 `file` |
| `APIFOX_PROJECT_ID` | 覆盖 `apifox.projectId` |

## 过滤

`contract.config.json` 的 `filter.excludePrefixes` / `filter.excludeExact` 用来滤掉服务框架
自带的路由（比如 Nitro 的 `/_nitro/*`、`/openapi.json`），它们不该出现在给前端用的契约里。

## 依赖约定

- `ofetch` 是**运行时依赖**（生成的 client 用它发请求）；
- `@tanstack/react-query` 是 **peerDependency**：由各 app 提供同一份实例，
  `apps/web` 的 `vite.config.ts` 里也把 `@tanstack/react-query` 加进了 `resolve.dedupe`；
  包内另有一份 `devDependency`，仅供包自身类型检查与生成使用。
  **注意**：包的主入口会 re-export `generated/@tanstack/react-query.gen.ts`，
  所以任何消费该入口的 app 都必须能解析到 `@tanstack/react-query`
  （pnpm 的 `auto-install-peers` 默认会装；不用 Query 的 app 可只 import 子路径）；
- `@hey-api/openapi-ts` 只在生成时使用，是 `devDependency`。
