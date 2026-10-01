# AGENTS.md

> **本文件是索引，不是手册。**
> 它**每次会话都会被自动加载**，所以只放四样东西：项目是什么、怎么跑命令、
> **要做什么该读哪份文档**、以及少数几条任何改动都适用的铁律。
>
> **动手前先查下面那张表**，读对应的那份 —— **细节都在 `.agents/docs/`，需要时才读，
> 不要一次全读**（那些文档加起来近 200 KB）。

## 项目是什么

多应用工作空间的后端管理台，纯客户端渲染的 SPA（无 SSR）：

- **React 19** + **Vite 8** + **TanStack Router / Query** + **zustand 5**（persist）
- **Tailwind CSS v4**（无 config）+ **Kumo**（Cloudflare 设计系统，基于 Base UI）
- **i18next**（7 语言；`ar-SA` 自动 `dir="rtl"`）
- 路径别名 `#/*` 与 `@/*` → `./src/*`；包管理器 **pnpm**
- 未配置单测与 lint（没有 Vitest / ESLint）

## 常用命令

```bash
pnpm dev              # 前端开发服务器 (http://localhost:3000)
pnpm mock             # Mock API (http://localhost:3001)，前端默认连它
pnpm build            # 前端生产构建（输出 apps/web/dist）
pnpm preview          # 预览前端构建产物
pnpm typecheck        # tsc --noEmit
pnpm contract         # 按 contract.config.json 同步契约（默认从本地 mock 拉）
pnpm api              # 一键：同步契约 + 在 packages/api-client 内生成 SDK/类型/schema/Query/派生索引
pnpm guardrails       # 铁律的机器检查（CI 用，scripts/ai/check-guardrails.mjs）
```

路由文件在 `pnpm dev` / `pnpm build` 时由 `@tanstack/router-plugin` 自动侦测并生成
`apps/web/src/routeTree.gen.ts`（**不要手改**）。

> **上面这些校验命令默认不跑**：`typecheck` / `build` / `dev` 与浏览器验收统一收在
> **`verify` skill**。**只有使用者明确点名「用 verify 校验」时才运行** —— 日常编码、
> 改完代码、提交前后都不要主动跑；正确性靠阅读类型定义、调用方与生成产物来保证。
>
> **注意这不适用于 CI**：流水线里 `typecheck` / `build` **必须跑**（它是合并的硬门控，
> 见 [docs/ai-dev-pipeline.md](./docs/ai-dev-pipeline.md)）。本约束管的是「人别为了确认而顺手跑」，
> 不是「禁止在流水线里跑」。

## 要做什么 → 读哪份

| 要做什么 | 读哪份 |
|---|---|
| **加页面 / 改页面业务代码（`src/features`）** | [features-architecture.md](./.agents/docs/features-architecture.md)（薄路由 + 一页一份 `feature.ts` 声明权限/指令/数据源）· 功能与测试清单 [features-catalog.md](./.agents/docs/features-catalog.md) |
| 加页面 / 改路由 / 改外壳布局 | [routing-architecture.md](./.agents/docs/routing-architecture.md) |
| 改导航项 / 命令面板 / 面包屑 | 同上（含「导航系统与命令面板」契约速查） |
| 改样式 / 用 Kumo 组件 / RTL 适配 | [ui-and-styling.md](./.agents/docs/ui-and-styling.md) |
| 加 store / 改持久化 / 切应用作用域 | [store.md](./.agents/docs/store.md) |
| 改登录登出 / 加 UI 文案 / 字典枚举 | [auth-and-i18n.md](./.agents/docs/auth-and-i18n.md) · [dict-i18n.md](./.agents/docs/dict-i18n.md) · [dict-options.md](./.agents/docs/dict-options.md) |
| 改接口调用 / 生成产物 / 缓存策略 | [api-client.md](./.agents/docs/api-client.md) |
| **改 Mock 接口 / 加一个接口** | [apps/mock/README.md](./apps/mock/README.md) —— 接口定义即契约 |
| **换后端 / 改契约来源 / 改 API 生成** | [packages/api-client/README.md](./packages/api-client/README.md) |
| **列表页 / 表格 / 筛选 / 列设置** | skill **`table-development`** ← 先加载它 |
| **表格 URL 搜索参数 / 增删改查规范** | [table-query-and-crud.md](./.agents/docs/table-query-and-crud.md) |
| **表单架构 / 人机协同 / 三态自适应** | [form-architecture.md](./.agents/docs/form-architecture.md) |
| **详情页表单 / 保存浮条 / 状态开关** | skill **`editable-detail`** ← 先加载它 |
| 列表点行看详情（分屏 / 抽屉） | [detail-preview.md](./.agents/docs/detail-preview.md) |
| 加仪表盘卡片 / 改栅格 | [dashboard-module.md](./.agents/docs/dashboard-module.md) |
| 改功能菜单树 | [features-module.md](./.agents/docs/features-module.md) |
| 改数据字典分类 | [data-dict-module.md](./.agents/docs/data-dict-module.md) |
| **改任何 AI 代码** | [ai-architecture.md](./.agents/docs/ai-architecture.md)（架构 / 数据流 / 扩展点 / 踩过的坑）· [ai-integration.md](./.agents/docs/ai-integration.md)（设计蓝图） |
| **改 AI 开发流水线 / issue 模板 / CI 门控** | [docs/ai-dev-pipeline.md](./docs/ai-dev-pipeline.md)（触发层 + 执行层 + 门控层，含标签状态机与铁律对应表） |
| 想知道「当初为什么这么选」 | [docs/](./docs/README.md)（调研与设计记录，相对稳定） |
| 要跑校验 | skill **`verify`** —— **只有使用者点名时才跑** |

各目录的完整清单：[.agents/docs/README.md](./.agents/docs/README.md)（现状与规范）、
[docs/README.md](./docs/README.md)（调研与设计）。

## 铁律（任何改动都适用，不必读文档）

1. **用户可见文案 7 语言齐**（`zh-CN` / `en-US` / `ja-JP` / `ar-SA` / `hi-IN` / `es-ES` / `tr-TR`）
   —— **只改中文等于没改**。
2. **禁用 Tailwind 的 `dark:` 变体**（主题由根节点 `data-mode` 驱动）、**禁用 `tracking-*`**、
   **严禁 `font-bold`**（标题 `font-semibold`、强调 `font-medium`）；颜色只用 Kumo 语义令牌
   （`bg-kumo-base` / `text-kumo-default` / `border-kumo-line` …）。
3. **名单与配置只有一个真值**：导航只动 `apps/web/src/lib/navigation.ts`、仪表盘卡片只动
   `src/features/home/widget-registry.tsx`、工具只动 `AI_TOOLS`。**不要在渲染处再硬编码一份平行的名单。**
4. **给模型的内容都必须经过函数并留过滤点**（提示词 / 导航清单 / 表单清单 / 页面接口），
   **过滤条件集中在一处** —— 否则「将来按权限收窄」的落点就被焊死了。
5. **校验命令默认不跑**（见上）；改动完**不要**主动跑 `typecheck` / `build`。
6. **本文件超过 64 KB 会被静默截断**（按字节截，不是行边界）—— 所以**别往里塞细节**，
   写到对应 doc 里，在这里的表里加一行。

## 文档目录的分工

| 位置 | 内容 | 会过期吗 | 谁读 |
|---|---|---|---|
| **本文件** | 索引 + 铁律 + 命令 | 少变 | 每次会话自动加载 |
| [`.agents/docs/`](./.agents/docs/README.md) | **现状与规范**：模块现状、架构、接入清单、踩过的坑 | **会**，改码时顺手同步 | coding agent |
| [`docs/`](./docs/README.md) | **调研与设计记录**：选型对比、为什么这么选 | 相对稳定 | 人（也供 agent 追溯依据） |

新增文档 → 登记到所在目录的 README，并在这张表或上面的索引里加一行。
