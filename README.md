# Nivo Admin

一套现代化、高颜值的全功能企业级后台管理系统模板，基于 **TanStack Router**、**Cloudflare Kumo UI** 与 **Tailwind CSS v4** 打造。

模板提供完整的企业级基础架构——统一登录门户、独立应用选择中心、全局控制台外壳、多语言与多主题支持，开箱即用。

**自带 Mock API 与 OpenAPI 契约**：`clone` 之后不依赖任何私有后端即可跑通全站；
将来接入你自己的后端时，只需要换一份契约（见 [packages/api-client](./packages/api-client/README.md)）。

## 仓库结构

```
apps/
  web/                # 前端：React 19 + Vite + TanStack Router/Query + Kumo
  mock/               # Mock API：Nitro v3，接口定义同时反向生成 OpenAPI 契约
packages/
  api-client/         # 契约唯一真值 + 由它生成并导出的 API 客户端（SDK/类型/schema/Query），多 app 复用
```

---

## 主要功能

### 1. 统一登录门户 (Login Portal)
- **现代分屏视觉**：左侧品牌形象展示与功能背书，右侧极简表单交互。
- **预设角色体验**：内置超级管理员、商业分析师、运维工程师等多角色一键体验能力。
- **悬浮全局操作**：登录页右上角提供无干扰的国际化多语言与深浅色外观切换。

### 2. 多应用工作空间选择 (Application Selector)
- **多系统接入矩阵**：登录后根据用户权限矩阵展示已授权的可访问应用列表（如管理控制台、实时数据分析中台、系统与权限中心、电商交易中心等）。
- **品牌化独立卡片**：各应用配备定制化渐变视觉、图标与所属业务域。
- **双阶段认证保护**：通过路由守卫拦截未选定应用直接进入后台的行为。

### 3. 企业级控制台外壳 (Admin Shell)
- **Cloudflare Kumo 规范侧边栏**：
  - 支持多级折叠菜单与角标展示；
  - 支持图标收起模式（悬停 Tooltip）与鼠标边缘拖拽自由调整宽度；
  - 桌面端视口吸顶且 Footer 贴底，小屏设备自动响应为全屏抽屉。
- **动态自适应面包屑**：根据导航配置与当前访问路径动态计算层级并支持点击回溯。
- **全局 ⌘K 命令面板**：按快捷键 `⌘ + K`（Windows `Ctrl + K`）快速唤起，支持拼音与关键词模糊检索全站页面并键盘快速导航。
- **多主题与国际化**：
  - 内置浅色（Light）、深色（Dark）及跟随系统（System）模式，零闪烁切换；
  - 内置简体中文、English、日本語、العربية（RTL）、हिन्दी、Español、Türkçe 等多语言支持，按业务模块自动扫描注册。
- **零卡顿与防抖加载**：
  - 页面跳转时侧边栏与顶栏永不重新渲染，保持原有状态；
  - 异步加载请求防抖（150ms 内完成不闪现骨架屏，出现骨架屏保持至少 300ms 避免闪烁）；
  - 错误与未找到状态局部渲染在内容区，不影响外壳与全局导航。

---

## 快速开始

### 环境依赖
- Node.js `^22.18` / `^24.11` / `>=26`（Vite+ 1.1.0 的要求）
- pnpm >= 9

### 启动项目

```bash
# 安装全部依赖（monorepo 一次装齐）
pnpm install

# 方式一（推荐）：一条命令并发起 Mock API + 前端 + AI 中间层，Ctrl-C 一次全停
pnpm dev:all

# 方式二：分开跑（各开一个终端）
pnpm mock   # Mock API  → http://localhost:3001
pnpm dev    # 前端      → http://localhost:3000
pnpm ai     # AI 中间层 → http://localhost:3002

# 生产构建 / 预览
pnpm build
pnpm preview
```

静态检查（Vite+ 统一入口，默认不跑）：`pnpm exec vp check`（格式 + lint + 类型检查）、
`pnpm exec vp fmt`、`pnpm exec vp test`（本仓暂无测试文件）。

登录时**任意非空账号 + 任意非空密码**都能进入。

### 局域网访问（手机 / 别的机器）

三个 dev server 默认就监听所有网卡，同一局域网内直接打开 `http://<本机 IP>:3000` 即可：

| 应用 | 绑定位置 | 地址 |
| --- | --- | --- |
| web | `apps/web/vite.config.ts` 的 `server.host` | `http://<本机 IP>:3000` |
| mock | `apps/mock/nitro.config.ts` 的 `devServer` | `http://<本机 IP>:3001` |
| ai | `apps/ai/wrangler.toml` 的 `[dev]` | `http://<本机 IP>:3002` |

接口地址要跟着换成同一个 IP（别的设备上的 `localhost` 指向它自己）：在
`apps/web/.env.development.local` 里覆盖 `VITE_API_BASE_URL` 与 `VITE_AI_SERVICE_BASE_URL`，
并把该来源加进 `apps/ai/wrangler.toml` 的 `ALLOWED_ORIGINS`。
完整说明见 [apps/web/.env.example](./apps/web/.env.example)。

Mock 的接口定义与 OpenAPI 契约同源：改了 `apps/mock` 里的路由后跑一次
`pnpm api`，前端 SDK 会跟着更新。

### 接入自己的后端

```bash
API_SPEC_SOURCE=url API_SPEC_URL=https://your-api.example.com/openapi.json pnpm contract
pnpm api
echo 'VITE_API_BASE_URL=https://your-api.example.com' > apps/web/.env.local
```

详见 [packages/api-client/README.md](./packages/api-client/README.md)。

---

## 深入技术文档

技术细节与设计规范已独立整理在 **[docs](./docs)** 目录中，供开发者深入查阅：

- [📘 路由与布局架构 (.agents/docs/routing-architecture.md)](./.agents/docs/routing-architecture.md) —— 文件系统路由、无路径布局机制、新增页面规范
- [🎨 UI 与样式设计规范 (.agents/docs/ui-and-styling.md)](./.agents/docs/ui-and-styling.md) —— Kumo UI 接入要点、Tailwind v4 配置、界面设计规则
- [🧩 Mock API (apps/mock/README.md)](./apps/mock/README.md) —— 契约驱动的假数据后端、部署到 Cloudflare / Vercel
- [📜 API 契约与客户端 (packages/api-client/README.md)](./packages/api-client/README.md) —— 契约来源切换、API 生成产物与「换后端」步骤
- [🔐 认证、多应用与国际化 (.agents/docs/auth-and-i18n.md)](./.agents/docs/auth-and-i18n.md) —— 双阶段登录认证、应用池配置、模块化零配置 i18n
- [🤖 AI 编程助手指引 (AGENTS.md)](./AGENTS.md) —— 面向 AI Agent / Claude Code 的项目开发总览与常用命令
