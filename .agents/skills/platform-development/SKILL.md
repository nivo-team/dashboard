---
name: platform-development
description: 本仓库工程底座（与「业务开发」相对）的入口 —— 路由与外壳布局、状态管理 / 持久化与按应用隔离、Kumo / Tailwind 样式与主题、认证与多应用、API 客户端与代码生成。加页面骨架、改路由、改样式、加 store、换后端 / 改契约来源时加载它。
---

# 平台开发（platform-development）

**「框架怎么搭」的单一入口。** 与 [business-development](../business-development/SKILL.md) 的分工：

- 这里讲**底座**：路由怎么分层、状态存哪、样式用什么令牌、请求从哪来；
- 那里讲**页面**：一个列表 / 表单 / 详情页怎么写、CRUD 视窗怎么调度。

改业务页面时通常两边都要，但**先看那边**（它给骨架），只有碰到下面某一条时才来翻这里。

## 0. 先读哪份

| 你要做什么 | 读 |
| --- | --- |
| 加页面 / 改路由 / 改外壳布局 / 改导航 / 改面包屑 | [references/routing-architecture.md](./references/routing-architecture.md) |
| 改样式 / 用 Kumo 组件 / 换主题 / RTL 适配 | [references/ui-and-styling.md](./references/ui-and-styling.md) |
| 加 store / 改持久化 / 切应用作用域 / 迁移存储键 | [references/store.md](./references/store.md) |
| 改登录登出 / 加多应用 / 改语言包加载 | [references/auth-and-i18n.md](./references/auth-and-i18n.md) |
| 改接口调用 / 改生成产物 / 换后端 / 改契约来源 | [references/api-client.md](./references/api-client.md) |
| 生成链路本身（`packages/api-client` 怎么跑、怎么指新后端） | `packages/api-client/README.md` |

**不要一次全读**：这五份加起来约 100 KB。按你要动的那一层取。

## 1. 四层底座，一句话各自是什么

| 层 | 真值在哪 | 一句话 |
| --- | --- | --- |
| **路由 / 外壳** | `apps/web/src/routes/**`（薄）+ `src/layouts/`（外壳） | 路由文件只做「路径 → 组件」的薄适配；外壳统一在 `layouts`，有 default / desktop / mobile 三变体，靠路径嵌套而非重复实现切换 |
| **状态** | `src/lib/store/**` | 三类状态分开存（持久化偏好 / 会话内 UI / 服务端缓存），都能按 `appId` 分区；切应用要连带切缓存与偏好键 |
| **样式** | `src/styles/**` + Kumo 语义令牌 | 主题由根节点 `data-mode` 驱动（**禁 `dark:`**），颜色只用语义令牌，链接只走 `RouterLink` |
| **请求** | `src/api/**` + `packages/api-client` | 类型与 Query 钩子由 OpenAPI 契约生成，**不手写 interface 映射后端字段**；缓存分区同样按 `appId` |

## 2. 三条最常踩的边界

1. **路由是薄适配层**：`src/routes/**` 里不写业务逻辑，只留守卫（`guardRoutePermission`）、取参、渲染。
   业务一律在 `src/features/**` —— 细节见 business-development。
2. **名单只有一个真值**：导航只动 `src/lib/navigation.ts`、仪表盘卡片只动 `src/features/home/widget-registry.tsx`、
   AI 工具只动 `AI_TOOLS`。**不要在渲染处再硬编码一份平行的名单。**
3. **样式三条禁令**：不写 `dark:` 变体、不写 `tracking-*`、不用 `font-bold`
   （标题 `font-semibold`、强调 `font-medium`）。理由与替代写法见 `references/ui-and-styling.md`。

## 3. 跨 skill 的依赖

改下面这些时，本 skill 给的是「底座怎么写」，落地成页面还要接上 business-development：

- 新路由 + 新页面 → 这里读 `routing-architecture`，那边读 SKILL.md §1/§3；
- 新接口 + 新页面 → 这里读 `api-client`，那边读 SKILL.md §3 第 1 步（先改 Mock 再 `pnpm api`）；
- 需要权限的页面 → 那边读 `references/permissions-architecture.md`。

## 4. 维护本 skill

- 每一层的规范只在它的 reference 里维护，**不要在别处再抄一份**。
- 新增底座能力（新的布局变体、新的存储分区、新的令牌）时，同步更新对应 reference，并回来核对 §1 是否还成立。
- `AGENTS.md` 只保留指向本 skill 的一行。
