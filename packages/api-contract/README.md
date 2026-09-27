# @admin/api-contract

整个仓库的 **OpenAPI 契约唯一真值**。

前端 SDK（`apps/web/src/api/generated/`）由它生成，本地 Mock（`apps/mock/`）默认按它反向产出。
两者都不再依赖任何私有后端。

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

# 2. 重新生成前端 SDK + 派生产物
pnpm api

# 3. 把前端指向你的服务
echo 'VITE_API_BASE_URL=https://your-api.example.com/api' > apps/web/.env.local
```

第 2 步之后**类型不匹配的地方会直接编译报错** —— 这正是它的价值：
契约和代码对不上的地方会被立刻指出来，而不是等到运行时才发现。

> 契约版本目前是 **OpenAPI 3.1**（Nitro 生成的格式）。如果你的后端导出的是 3.0，
> 一般可以直接用；若遇到 `nullable` 之类的 3.0 专有写法，先在上游转成 3.1 再同步。

## 环境变量

都只影响 `sync.mjs` 的这一次执行，不写回配置文件（方便 CI 里临时切换）：

| 变量 | 作用 |
| --- | --- |
| `API_SPEC_SOURCE` | 覆盖 `source` |
| `API_SPEC_URL` | 覆盖 `url`（`source=mock` 时覆盖 `mock.url`） |
| `API_SPEC_FILE` | 覆盖 `file` |
| `APIFOX_PROJECT_ID` | 覆盖 `apifox.projectId` |

## 过滤

`filter.pathPrefix`（默认 `/api`）只保留该前缀下的路径，用来滤掉服务框架自带的路由
（比如 Nitro 的 `/_nitro/tasks`、`/_scalar`）。
