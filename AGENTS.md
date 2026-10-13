# AGENTS.md

> **本文件是索引，不是手册。**
> 它**每次会话都会被自动加载**，所以只放四样东西：项目是什么、怎么跑命令、
> **要做什么该加载哪个 skill**、以及少数几条任何改动都适用的铁律。
>
> **动手前先查下面那张表，加载对应的 skill** —— 细节都在各 skill 的 `references/` 里，
> 由 skill 的 §0 表再往下导，**不要一次全读**（各 skill 的 references 加起来超过 500 KB）。

## 项目是什么

多应用工作空间的后端管理台，纯客户端渲染的 SPA（无 SSR）：

- **React 19** + **Vite+ 1.1.0**（Vite 8 / Rolldown 内核，`vp` 工具链，配置在根 `vite.config.ts`）
  + **TanStack Router / Query** + **zustand 5**（persist）
- **Tailwind CSS v4**（无 config）+ **Kumo**（Cloudflare 设计系统，基于 Base UI）
  + **dnd-kit**（只用于页面标签页的拖拽排序，见 [routing-architecture.md](.agents/skills/platform-development/references/routing-architecture.md)）
- **i18next**（多语言；**语言清单的真值只有 `i18n.config.json` 一处**，别照抄文档里的列表）
- 路径别名 `#/*` 与 `@/*` → `./src/*`；包管理器 **pnpm**
- **AI 核心集中在 [`src/features/ai/`](./apps/web/src/features/ai/README.md)**（逻辑 / UI / 渲染 / 全屏页 / 页面声明框架）—— 改 AI 先读那里的地图
- **原生壳在 [`apps/native/`](./apps/native/README.md)**（Wails v3 + Go，超薄：支持桌面与 Android 移动端，只加载远程 http/https 地址 + 一条通用 bridge）—— 改 bridge 协议 / 加原生能力读那份
- **Vite+ 工具链**（`vp`）：dev/build 走 `vp`，lint/format 用内置 oxlint/oxfmt（规则见根
  `vite.config.ts`）；**暂无单测**（`vp test` 会报「没有测试文件」）

## 常用命令

```bash
pnpm dev              # 前端开发服务器 (http://localhost:3000)
pnpm dev:all          # 一键并发：mock(3001) + web(3000) + ai(3002)，Ctrl-C 一次全停
pnpm mock             # Mock API (http://localhost:3001)，前端默认连它
pnpm ai               # AI 中间层 Worker（wrangler dev，http://localhost:3002）
pnpm native           # 原生壳（Wails v3 + Go，默认加载 http://localhost:3000；兼容别名 pnpm desktop）
pnpm native:test      # 原生壳的 Go 测试（协议层护栏）
pnpm native:bindings  # 由 Go 方法目录生成页面侧 bridge 类型（apps/web/src/native/generated/）
pnpm native:bindings:check  # 校验生成物是否为最新（CI / 提交前）
pnpm native:build     # 原生壳 macOS/桌面出发布产物（地址来自构建环境 DESKTOP_URL）
pnpm native:android:build  # 原生壳 Android 构建（打包 APK，见 apps/native/README.md）
pnpm native:android:env    # 检测 Android 构建环境（JDK / SDK / NDK / CLI）
pnpm build            # 前端生产构建（走 vp build，输出 apps/web/dist）
pnpm preview          # 预览前端构建产物
pnpm typecheck        # tsc --noEmit
pnpm exec vp check    # Vite+ 全量静态检查：fmt + oxlint + tsgolint 类型检查
pnpm exec vp fmt      # 按根 vite.config.ts 的规则格式化（单引号 / 无分号 / 宽度 100）
pnpm contract         # 按 contract.config.json 同步契约（默认从本地 mock 拉）
pnpm api              # 一键：同步契约 + 在 packages/api-client 内生成 SDK/类型/schema/Query/派生索引
pnpm guardrails       # 铁律的机器检查（CI 用，scripts/ai/check-guardrails.mjs）
pnpm i18n:dry         # 只看「哪些键待翻译」，不写文件、不调 AI
pnpm i18n:provider    # 只打印翻译会打到哪个网关/模型（核对配置用）
pnpm i18n             # 补翻译：只翻增量、带缓存（I18N_GATEWAY_* 或共用 DSH_GATEWAY_*）
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
> 见 [.agents/skills/platform-ops/references/ai-dev-pipeline.md](.agents/skills/platform-ops/references/ai-dev-pipeline.md)）。本约束管的是「人别为了确认而顺手跑」，
> 不是「禁止在流水线里跑」。

## 要做什么 → 加载哪个 skill

**规范与现状已经全部收进 skill**（在 `.agents/skills/`，用户可用 `/<名字>` 调用）。
先加载下面这个 skill，它内部还有一张更细的 §0 表把你导到具体 reference。

| 要做什么 | 加载哪个 skill |
|---|---|
| **写业务页面**：列表 / 表格 / 表单 / 详情 / CRUD 视窗 / 编辑浮条 / 仪表盘卡片 / 系统模块页（角色 / 菜单 / 字典） / 权限接入 / 薄路由 | **`business-development`** |
| **改工程底座**：路由与外壳布局 / 导航与命令面板 / 状态与持久化 / 样式与 Kumo / 登录与多应用 / API 客户端与代码生成 | **`platform-development`** |
| **改 AI**：提示词 / 工具 / 权限粒度 / 上下文预算 / 中间层（`apps/ai`、`packages/ai-prompt`）/ 页面声明框架 | **`ai-development`** |
| **仓库运维**：AI 开发流水线 / CI 门控 / issue 模板 / Secrets 与 Variables / i18n 翻译流水线 | **`platform-ops`** |
| **改原生壳 / 加原生能力 / 改 bridge 协议** | [apps/native/README.md](./apps/native/README.md)（Wails v3 超薄壳；页面侧接口 `#/native/bridge`，生成物在 `apps/web/src/native/generated/`） |
| **改 Mock 接口 / 加一个接口** | [apps/mock/README.md](./apps/mock/README.md) —— 接口定义即契约 |
| **改 API 生成链路本身** | [packages/api-client/README.md](./packages/api-client/README.md) |
| 想知道「当初为什么这么选」 | [docs/](./docs/README.md)（调研与设计记录，相对稳定；**日常开发用不上**） |
| 要跑校验 | skill **`verify`** —— **只有使用者点名时才跑** |

> **`platform-ops` 与 `platform-development` 别搞混**：前者管「仓库怎么运转」（CI、Secrets、翻译流水线），
> 后者管「代码怎么写」（路由、store、样式、请求）。

## 铁律（任何改动都适用，不必读文档）

1. **只写默认语言，其它语言交给流水线**：新增/修改用户可见文案时**只改**
   `apps/web/src/messages/<ns>/<sourceLocale>.json`（默认语言 = `i18n.config.json`
   的 `sourceLocale`，**现读现用、别记**），**不要手写其它语言** ——
   它们由 `pnpm i18n`（或 CI 的 `translate.yml`）用 AI 补齐，带缓存、只翻增量。
   **语言清单的真值也只有 `i18n.config.json` 一处**（`sourceLocale` + `targetLocales`），
   **不要在文档、注释或代码里列举语言** —— 它变过，抄到别处必然过期。
   写错键名会在 `pnpm typecheck` / `pnpm build` 直接报错（用 `#/lib/use-typed-t` 的
   `useT('ns')`）；`pnpm i18n:check` 会拦住「没补翻译就合并」。详见
   [i18n-translation-pipeline.md](.agents/skills/platform-ops/references/i18n-translation-pipeline.md)。
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

## 文档放哪

| 位置 | 内容 | 会过期吗 | 谁读 |
|---|---|---|---|
| **本文件** | 索引 + 铁律 + 命令 | 少变 | 每次会话自动加载 |
| **`.agents/skills/*/references/`** | **现状与规范**：模块现状、架构、接入清单、踩过的坑 | **会**，改码时顺手同步 | coding agent（由 skill 按需加载） |
| [`docs/`](./docs/README.md) | **调研与设计记录**：选型对比、为什么这么选 | 相对稳定 | 人（也供 agent 追溯依据） |
| `apps/*/README.md` | 单个 app / 包自己的说明与命令 | 会 | 改那个 app 时 |

**新增规范文档 → 放进对应 skill 的 `references/`，并把该 skill 的 §0 表加一行。**
不要新建顶层文档目录，也不要往本文件里塞细节（超过 64 KB 会被静默截断）。
不确定该归哪个 skill，就问：这属于「页面怎么写」`business-development`、
「底座怎么搭」`platform-development`、「AI 怎么改」`ai-development`、
还是「仓库怎么运转」`platform-ops`。
