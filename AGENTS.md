# AGENTS.md

> **本文件是索引，不是手册。**
> 它**每次会话都会被自动加载**，所以只放四样东西：项目是什么、怎么跑命令、
> **要做什么该读哪份文档**、以及少数几条任何改动都适用的铁律。
>
> **动手前先查下面那张表**，读对应的那份 —— **细节都在 `.agents/docs/`，需要时才读，
> 不要一次全读**（那些文档加起来近 200 KB）。

## 项目是什么

多应用工作空间的后端管理台，纯客户端渲染的 SPA（无 SSR）：

- **React 19** + **Vite+ 1.1.0**（Vite 8 / Rolldown 内核，`vp` 工具链，配置在根 `vite.config.ts`）
  + **TanStack Router / Query** + **zustand 5**（persist）
- **Tailwind CSS v4**（无 config）+ **Kumo**（Cloudflare 设计系统，基于 Base UI）
- **i18next**（7 语言；`ar-SA` 自动 `dir="rtl"`）
- 路径别名 `#/*` 与 `@/*` → `./src/*`；包管理器 **pnpm**
- **AI 核心集中在 [`src/features/ai/`](./apps/web/src/features/ai/README.md)**（逻辑 / UI / 渲染 / 全屏页 / 页面声明框架）—— 改 AI 先读那里的地图
- **桌面壳在 [`apps/desktop/`](./apps/desktop/README.md)**（Wails v3 + Go，超薄：只加载远程 http/https 地址 + 一条通用 bridge）—— 改 bridge 协议 / 加原生能力读那份
- **Vite+ 工具链**（`vp`）：dev/build 走 `vp`，lint/format 用内置 oxlint/oxfmt（规则见根
  `vite.config.ts`）；**暂无单测**（`vp test` 会报「没有测试文件」）

## 常用命令

```bash
pnpm dev              # 前端开发服务器 (http://localhost:3000)
pnpm dev:all          # 一键并发：mock(3001) + web(3000) + ai(3002)，Ctrl-C 一次全停
pnpm mock             # Mock API (http://localhost:3001)，前端默认连它
pnpm ai               # AI 中间层 Worker（wrangler dev，http://localhost:3002）
pnpm desktop          # 桌面壳（Wails v3 + Go，默认加载 http://localhost:3000）
pnpm desktop:test     # 桌面壳的 Go 测试（协议层护栏）
pnpm desktop:build    # 桌面壳出发布产物（地址来自构建环境 DESKTOP_URL，见 apps/desktop/README.md）
pnpm build            # 前端生产构建（走 vp build，输出 apps/web/dist）
pnpm preview          # 预览前端构建产物
pnpm typecheck        # tsc --noEmit
pnpm exec vp check    # Vite+ 全量静态检查：fmt + oxlint + tsgolint 类型检查
pnpm exec vp fmt      # 按根 vite.config.ts 的规则格式化（单引号 / 无分号 / 宽度 100）
pnpm contract         # 按 contract.config.json 同步契约（默认从本地 mock 拉）
pnpm api              # 一键：同步契约 + 在 packages/api-client 内生成 SDK/类型/schema/Query/派生索引
pnpm guardrails       # 铁律的机器检查（CI 用，scripts/ai/check-guardrails.mjs）
pnpm i18n:dry         # 只看「哪些键待翻译」，不写文件、不调 AI
pnpm i18n             # 补翻译：只翻增量、带缓存（需 DSH_GATEWAY_* 凭据）
pnpm i18n:check       # 键是否齐全 + 译文是否最新 + 类型是否同步（CI 用）
pnpm i18n:types       # 重新生成 i18n 键类型（改了 zh-CN.json 后跑）
```

路由文件在 `pnpm dev` / `pnpm build` 时由 `@tanstack/router-plugin` 自动侦测并生成
`apps/web/src/routeTree.gen.ts`（**不要手改**）。

> **上面这些校验命令默认不跑**：`typecheck` / `build` / `dev` / `vp check` / `vp fmt` 与浏览器验收统一收在
> **`verify` skill**。**只有使用者明确点名「用 verify 校验」时才运行** —— 日常编码、
> 改完代码、提交前后都不要主动跑；正确性靠阅读类型定义、调用方与生成产物来保证。
>
> **注意这不适用于 CI**：流水线里 `typecheck` / `build` **必须跑**（它是合并的硬门控，
> 见 [docs/ai-dev-pipeline.md](./docs/ai-dev-pipeline.md)）。本约束管的是「人别为了确认而顺手跑」，
> 不是「禁止在流水线里跑」。

## 要做什么 → 读哪份

| 要做什么 | 读哪份 |
|---|---|
| **加页面 / 改页面业务代码（`src/features`）** | [features-architecture.md](./.agents/docs/features-architecture.md)（薄路由 + 一页一份 `feature.ts` 声明权限/指令/数据源，框架在 `#/features/ai/page`）· 功能与测试清单 [features-catalog.md](./.agents/docs/features-catalog.md) |
| 加页面 / 改路由 / 改外壳布局 | [routing-architecture.md](./.agents/docs/routing-architecture.md) |
| 改导航项 / 命令面板 / 面包屑 | 同上（含「导航系统与命令面板」契约速查） |
| 改样式 / 用 Kumo 组件 / RTL 适配 | [ui-and-styling.md](./.agents/docs/ui-and-styling.md) |
| 加 store / 改持久化 / 切应用作用域 | [store.md](./.agents/docs/store.md) |
| 改登录登出 / 加 UI 文案 / 字典枚举 | [auth-and-i18n.md](./.agents/docs/auth-and-i18n.md) · [dict-i18n.md](./.agents/docs/dict-i18n.md) · [dict-options.md](./.agents/docs/dict-options.md) |
| **加/改用户可见文案（i18n 翻译流水线）** | [i18n-translation-pipeline.md](./.agents/docs/i18n-translation-pipeline.md) —— 只写 `zh-CN`，其它语言交给 `pnpm i18n` |
| **加需要权限的页面 / 按钮 / 菜单 / AI 工具** | [permissions-architecture.md](./.agents/docs/permissions-architecture.md)（唯一判定点 `hasPermission`、`Admin` 不是超管、三个导航过滤入口、守卫与按钮级收口） |
| 改接口调用 / 生成产物 / 缓存策略 | [api-client.md](./.agents/docs/api-client.md) |
| **改 Mock 接口 / 加一个接口** | [apps/mock/README.md](./apps/mock/README.md) —— 接口定义即契约 |
| **换后端 / 改契约来源 / 改 API 生成** | [packages/api-client/README.md](./packages/api-client/README.md) |
| **列表页 / 表格 / 筛选 / 列设置** | skill **`table-development`** ← 先加载它 |
| **表格 URL 搜索参数 / 增删改查规范** | [table-query-and-crud.md](./.agents/docs/table-query-and-crud.md) |
| **表单架构 / 人机协同 / 三态自适应** | [form-architecture.md](./.agents/docs/form-architecture.md) |
| **详情页表单 / 保存浮条 / 状态开关** | skill **`editable-detail`** ← 先加载它 |
| 列表点行看详情（分屏 / 抽屉） | [detail-preview.md](./.agents/docs/detail-preview.md) |
| 加仪表盘卡片 / 改栅格 | [dashboard-module.md](./.agents/docs/dashboard-module.md) |
| 改菜单管理（菜单树）/ 角色管理 | [features-module.md](./.agents/docs/features-module.md)（术语已从「功能」改为**目录 / 菜单 / 操作**；菜单与角色数据模型见 [apps/mock/README.md](./apps/mock/README.md)） |
| 改数据字典分类 | [data-dict-module.md](./.agents/docs/data-dict-module.md) |
| **改任何 AI 代码** | 先看模块地图 [src/features/ai/README.md](./apps/web/src/features/ai/README.md)（**AI 核心全在这一个目录**：core / components / markdown / sphere / page）· [ai-architecture.md](./.agents/docs/ai-architecture.md)（架构 / 数据流 / 扩展点 / 踩过的坑）· [ai-integration.md](./.agents/docs/ai-integration.md)（设计蓝图） |
| **加/改 AI 工具、AI 权限粒度、批量任务编排** | [ai-architecture.md](./.agents/docs/ai-architecture.md) §3.1（能力矩阵）· §7.1（Todo 编排）· 清单 [ai-module-inventory.md](./.agents/docs/ai-module-inventory.md) §6 |
| **改 AI 开发流水线 / issue 模板 / CI 门控** | [docs/ai-dev-pipeline.md](./docs/ai-dev-pipeline.md)（触发层 + 执行层 + 门控层，含标签状态机与铁律对应表） |
| **改桌面壳 / 加原生能力（菜单 / 托盘 / 文件对话框）/ 改 bridge 协议** | [apps/desktop/README.md](./apps/desktop/README.md)（Wails v3 超薄壳：URL 桌面标记、Raw Messages 通道、`__bridge` 的 call/on）· 页面侧接口 `#/lib/desktop-bridge` |
| 想知道「当初为什么这么选」 | [docs/](./docs/README.md)（调研与设计记录，相对稳定） |
| 要跑校验 | skill **`verify`** —— **只有使用者点名时才跑** |

各目录的完整清单：[.agents/docs/README.md](./.agents/docs/README.md)（现状与规范）、
[docs/README.md](./docs/README.md)（调研与设计）。

## 铁律（任何改动都适用，不必读文档）

1. **只写源语言 `zh-CN`，其它语言交给流水线**：新增/修改用户可见文案时**只改**
   `apps/web/src/messages/<ns>/zh-CN.json`，**不要手写其它 6 种语言** ——
   它们由 `pnpm i18n`（或 CI 的 `translate.yml`）用 AI 补齐，带缓存、只翻增量。
   写错键名会在 `pnpm typecheck` / `pnpm build` 直接报错（用 `#/lib/use-typed-t` 的
   `useT('ns')`）；`pnpm i18n:check` 会拦住「没补翻译就合并」。详见
   [i18n-translation-pipeline.md](./.agents/docs/i18n-translation-pipeline.md)。
2. **禁用 Tailwind 的 `dark:` 变体**（主题由根节点 `data-mode` 驱动）、**禁用 `tracking-*`**、
   **严禁 `font-bold`**（标题 `font-semibold`、强调 `font-medium`）；颜色只用 Kumo 语义令牌
   （`bg-kumo-base` / `text-kumo-default` / `border-kumo-line` …）；
   **全站链接统一用 `#/components/router-link`（`RouterLink`）**，严禁手写 `<a>` 或裸写 TanStack `<Link>` 手拼样式，
   颜色与下划线由 Kumo 官方链接主色及变体（`variant="plain|inline"`）统一驱动。
3. **名单与配置只有一个真值**：导航只动 `apps/web/src/lib/navigation.ts`、仪表盘卡片只动
   `src/features/home/widget-registry.tsx`、工具只动 `AI_TOOLS`。**不要在渲染处再硬编码一份平行的名单。**
4. **给模型的内容都必须经过函数并留过滤点**（提示词 / 导航清单 / 表单清单 / 页面接口），
   **过滤条件集中在一处** —— 否则「将来按权限收窄」的落点就被焊死了。
5. **校验命令默认不跑**（见上）；改动完**不要**主动跑 `typecheck` / `build` / `vp check` / `vp fmt`。
6. **本文件超过 64 KB 会被静默截断**（按字节截，不是行边界）—— 所以**别往里塞细节**，
   写到对应 doc 里，在这里的表里加一行。

## 文档目录的分工

| 位置 | 内容 | 会过期吗 | 谁读 |
|---|---|---|---|
| **本文件** | 索引 + 铁律 + 命令 | 少变 | 每次会话自动加载 |
| [`.agents/docs/`](./.agents/docs/README.md) | **现状与规范**：模块现状、架构、接入清单、踩过的坑 | **会**，改码时顺手同步 | coding agent |
| [`docs/`](./docs/README.md) | **调研与设计记录**：选型对比、为什么这么选 | 相对稳定 | 人（也供 agent 追溯依据） |

新增文档 → 登记到所在目录的 README，并在这张表或上面的索引里加一行。
