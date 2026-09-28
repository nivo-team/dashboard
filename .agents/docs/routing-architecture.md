# 路由与布局架构

本项目基于 `@tanstack/react-router` 采用**文件系统路由**与**分层无路径布局**，核心设计理念是：**外壳由 layout 持有，页面级异步只影响内容区，保证极致流畅的操作体验**。

---

## 1. 路由分层拓扑

```
apps/web/src/routes/
├── __root.tsx                 # 根路由：提供 Kumo LinkProvider、全局 Toasty 容器、全屏 404 与 Devtools
├── _auth/                     # 认证门户专用无路径布局
│   ├── route.tsx              #   顶部悬浮语言与主题切换器
│   └── login.tsx              #   登录页面 (/login)
├── _main/                     # 与 appId 无关的通用外壳布局（无路径布局）
│   ├── route.tsx              #   全局工作台外壳（Kumo Sidebar + Header，登录鉴权拦截）
│   ├── index.tsx              #   根路径 /：工作空间应用选择页 (SelectAppPage)
│   ├── select-app.tsx         #   兼容旧路由 /select-app，重定向至 /
│   ├── settings/              #   设置模块（进入后侧边栏切换为模块专属二级导航）
│   │   ├── route.tsx          #     模块根：仅 <Outlet />；二级侧边栏由 MainLayout 按路由前缀切换
│   │   ├── index.tsx          #     /settings 重定向到默认子页 /settings/profile
│   │   ├── profile.tsx        #     个人资料 (/settings/profile)：只读展示 GET /profile 的资料与区域权限
│   │   └── appearance.tsx     #     外观 (/settings/appearance)：外观 / 语言 / 时区（即时生效）
│   └── $.tsx                  #   _main 外壳内局部 404 兜底路由
└── $appId/                    # 业务控制台应用前缀（参数化动态应用路由，去除了中间冗余 _app）
    ├── route.tsx              #   AppShell 外壳：侧边栏 + 顶栏 + ⌘K 面板（App 校验、同步与规范化）
    ├── index.tsx              #   访问 /$appId 自动重定向至默认首页 /$appId/home
    ├── home.tsx               #   /$appId/home 业务仪表盘默认首页
    ├── $.tsx                  #   外壳内局部 404 页面
    └── example/               #   /$appId/example 业务模块示例
        ├── index.tsx          #     概览页
        └── async.tsx          #     异步 loader 与状态演示
```

---

## 2. 核心架构机制

### 双层外壳拓扑：_main 与 $appId 隔离
- **全局通用外壳 (`_main/`)**：处理与具体应用无关的通用业务，例如工作空间应用列表选择 (`/`)、个人资料 (`/settings/profile`) 等。
- **业务控制台外壳 (`$appId/`)**：扁平化去除了多余的 `_app` 中间层，直接由 `apps/web/src/routes/$appId/route.tsx` 承载 `AppShell`。每个应用系统享有隔离的 URL 空间 `/$appId/...`，路由守卫自动根据 URL 参数同步激活当前 App 及其专属的 `apiBaseUrl`。
- **默认首页与智能面包屑**：
  - 应用默认首页统一规范为 `/$appId/home`（访问 `/$appId` 自动重定向）；
  - 顶栏面包屑自动剥离第一段 `$appId` 参数，使业务层级链路清晰直观（如 `/$appId/home` 显示为 `首页`，`/$appId/orders` 显示为 `首页 / 订单管理`）；
  - 历史别名路径（如 `/admin`）会自动规范化重定向至 `/$appId/home`；
  - 未知应用校验：若 URL 中指定的 `$appId` 不在可用应用列表与系统预设中，路由守卫直接抛出 `notFound()` 并在 `_main` 通用外壳中呈现 404 引导页，使用户仍可通过完整的导航与侧边栏回到工作空间。

### 外壳持久化（Zero-Remount）
`AppShell` 与 `MainLayout` 分别挂载在 `$appId/route.tsx` 和 `_main/route.tsx` 上。子路由切换时：
- 侧边栏折叠状态、拖拽宽度、内部滚动位置**完全保留**；
- 页面仅在 `<Outlet />` 区域替换组件，避免整页闪烁与重复渲染。

侧边栏的 `Sidebar.Provider` 接线（含**桌面非受控、移动端受控**这套移动端抽屉接法）
统一在 `#/components/shell-sidebar-provider` 的 `ShellSidebarProvider`，两个外壳共用一份 ——
原因与踩过的坑见 [store.md](./store.md) §5.4。

### 局部异步与状态隔离
在 `apps/web/src/router.tsx` 中配置了全局默认状态组件：
- `defaultPendingComponent`: 加载骨架屏；
- `defaultErrorComponent`: 页面错误边界；
- `defaultNotFoundComponent`: 局部 404 兜底。

这些组件会被挂载在**当前触发路由的 `<Outlet />`** 位置，不会替换整页或破坏外部侧栏与顶栏。

### 防抖与预加载体验
- **防闪烁机制**：`defaultPendingMs: 150`（150ms 内完成请求不出现加载动画）与 `defaultPendingMinMs: 300`（一旦展示加载动画至少保留 300ms，避免动画闪现）。
- **意图预加载**：`defaultPreload: 'intent'`，鼠标悬停链接时自动预拉取路由代码与 loader 数据。

---

## 3. 开发指引：添加新页面

1. **新建业务路由文件**：在 `apps/web/src/routes/$appId/` 对应路径下创建 `.tsx` 文件（如 `apps/web/src/routes/$appId/orders.tsx` 即映射为 `/$appId/orders`）：
   ```tsx
   import { createFileRoute } from '@tanstack/react-router'
   import { PageHeader } from '#/components/page-header'

   export const Route = createFileRoute('/$appId/orders')({
     loader: async () => {
       const data = await fetchOrders()
       return { data }
     },
     component: OrdersPage,
   })

   function OrdersPage() {
     const { data } = Route.useLoaderData()
     return <PageHeader title="订单管理" description={`当前共 ${data.length} 笔订单`} />
   }
   ```

2. **配置导航与快捷入口**：在 `apps/web/src/lib/navigation.ts` 的 `NAV_GROUPS` 中添加该项，侧边栏与 ⌘K 命令面板将同步生效。

3. **嵌套子导航**：如需多标签页或二级页面，可创建同名布局 `orders.tsx`（内含 Tab 栏与 `<Outlet />`）以及 `orders/index.tsx`、`orders/detail.tsx`。

2. **配置导航与快捷入口**：在 `apps/web/src/lib/navigation.ts` 的 `NAV_GROUPS` 中添加该项，侧边栏与 ⌘K 命令面板将同步生效。

3. **嵌套子导航**：如需多标签页或二级页面，可创建同名布局 `orders.tsx`（内含 Tab 栏与 `<Outlet />`）以及 `orders/index.tsx`、`orders/detail.tsx`。

---

> 以下由 `AGENTS.md` §1 搬入（原文保留）。**契约级的硬约束仍在 `AGENTS.md`**，
> 这里放完整说明：目录拓扑、各路由文件的职责、设置模块的侧边栏切换、面包屑与注册机制。

## 1. 多布局分层路由架构 (Multi-Layout Routing Architecture)

> 路由分层拓扑、外壳持久化（Zero-Remount）与「加新页面」的步骤见
> [./routing-architecture.md](./routing-architecture.md)。

路由文件位于 `apps/web/src/routes/`，自动汇编输出为 `apps/web/src/routeTree.gen.ts`（自动生成，禁止手动编辑）。

- `__root.tsx`：根路由。统一使用 `<LinkProvider component={AppLink}>` 桥接所有 Kumo 内部链接至 TanStack 客户端导航，挂载全局 `<Toasty toastManager={appToastManager}>` 通知容器（共享管理器见 `apps/web/src/lib/toast.ts`，供 API 拦截器等非 React 上下文复用），并集成 TanStack Devtools。
- `_main/`：与 `appId` 无关的全局通用无路径外壳 (`_main/route.tsx`)。
  - `_main/index.tsx`：根路径 (`/`) 承载工作空间应用选择页 (`SelectAppPage`)，未登录拦截跳转至 `/login`，已登录供用户选择或切换应用系统。
  - `_main/select-app.tsx`：兼容历史 `/select-app` 路径，规范化重定向至根路径 `/`。
  - `_main/settings/`：设置模块（**目录化**，与 `/` 共用 `MainLayout`；当前「个人资料 / 外观 / AI」三个子页）。
    - `settings/route.tsx`：模块根，只渲染 `<Outlet />`；`settings/index.tsx` 把 `/settings` 重定向到默认子页 `/settings/profile`（与 `$appId/users/` 同一套写法）。**设置模块的二级导航由 `MainLayout` 的 `MainSidebarSwitch` 按路由前缀切换**（`/settings`、`/settings/**` → `SettingsSidebar`，其余 → 通用导航）—— 嵌套路由只能替换内容区，无法接管外层侧边栏。两套导航共用品牌 Header（`SidebarBrandHeader`：方块 + 标题 + 移动端关闭按钮）与「快速搜索」入口（`SidebarSearchButton`，与 `AppSidebar` 同一套 Kumo 官方范式）；`SettingsSidebar` 在品牌行之下再加一行 `SettingsModuleHeader`（返回 `/` + 模块标题「设置」，参照 Cloudflare 控制台），**真正替换的只有模块行与菜单**。这是「同一 Sidebar 位置换内容」而非第二个 `Sidebar`，`Sidebar.Provider` 不重挂，折叠状态与拖拽宽度都保留。`_main` 外壳已挂 `CommandPaletteDialog`（⌘K / Ctrl+K，与 `AppShell` 同款接线），搜索按钮与快捷键共享同一面板。
    - `settings/profile.tsx`：个人资料 (`/settings/profile`)，只读展示 `GET /profile` 返回的账号资料与区域权限 —— 接口路径与前端路由无关，仍是同一支接口；后端没有更新接口，因此不做表单；接口不可用时逐项回落本地登录态（`useAuth().user`）并显式提示，不把兜底数据伪装成后端值。
    - `settings/appearance.tsx`：外观 (`/settings/appearance`)，单张 `LayerCard`（标题「通用设置」`profile.settings.general`，形态是 `LayerCard.Secondary` + `LayerCard.Primary`）里放着**五项**本机偏好：主题（`#/lib/use-color-mode`）/ 语言（`#/lib/use-locale`）/ 时区（`#/lib/timezone`）/ 详情打开方式（`#/lib/store` 的 `detailOpenMode`，见 [./detail-preview.md](./detail-preview.md)）/ 页面宽度（`#/lib/store` 的 `pageWidth`：全宽 / 限宽居中，默认全宽，落点在 `#/lib/page-width`）—— 五者都是**即时生效 + 持久化在 `admin.preferences:<appId>`（按应用隔离，见 [./store.md](./store.md)）**，所以**没有保存按钮、没有 dirty 状态，不要套 `UnsavedChangesBar` 那套编辑态契约**。控件选型：**短枚举（≤3 项）用 Kumo `Tabs` 的 segmented 分段控件**（主题、详情打开方式、页面宽度），长枚举（语言 7 项、时区 8 项）用 `Select`；**「详情打开方式」与「页面宽度」每段选项悬浮时还会弹一个浮层，用通用缩略图把该档位的页面变化演一遍**（`#/components/app-shell-preview`，见第 5 节）。账号安全 / 已连接应用 / API Token 等更重的设置后续扩展（往 `components/main-layout.tsx` 的 `SETTINGS_NAV_ITEMS` 追加导航项、或在卡片下方再加一张 `LayerCard` 即可）。
    - `settings/AI.tsx`：AI (`/settings/AI`)，与外观页同一套「设置卡片 + 设置行」形态（`#/components/settings-card` 的 `SettingsCard` / `SettingRow`，不要再手写 `LayerCard`）。当前只有一项配置：**显示方式**（`admin.preferences:<appId>` 的 `aiPanelMode`，`split` = Split View / `float` = Float）—— 与外观页同属「即时生效 + 按应用隔离持久化」，**没有保存按钮、没有 dirty 状态**。控件是与「主题」一致的分段控件（`Tabs` + `role="group"` 兜可访问名称），并带与「详情打开方式」同款的悬浮预览（见第 5 节）。**卡片标题直接复用 `profile.settings.general`（「通用设置」），不另开 `aiSection` 之类的重复文案**；设置项文案在 `profile.settings.aiDisplayMode*`，**两个选项（`aiModes.split` / `aiModes.float`）是形态名、7 语言各自本地化**（中文「分屏视图 / 浮窗」，不要写成产品术语原文）。后续 AI 偏好继续往这张卡片加 `SettingRow`，或下方再加一张 `SettingsCard`。**文件名与路径保留大写的 `AI`**（缩写，与导航项显示名一致），由 `pnpm generate-routes` 生成的 `routeTree.gen.ts` 同步。
    - 入口：侧边栏「个人资料」与顶栏 `UserMenu` 的 Profile 项（都指向 `/settings/profile`）；默认文案：中文「个人资料」、英文「Profile」（日语 `プロフィール`）。
  - `_main/$.tsx`：`_main` 外壳内局部 404 兜底路由；全局挂载 `notFoundComponent: NotFound`。
- `$appId/`：与特定应用强绑定的动态业务路由体系（**模块目录化**，每个业务模块独占一个目录）。
  - `$appId/route.tsx`：业务控制台外壳布局（承载 `AppShell`：侧边栏、顶部导航条、面包屑、⌘K 命令面板）；
  - `$appId/index.tsx`：访问 `/$appId` 根路径时自动重定向至默认主页 `/$appId/home`；
  - `$appId/home/index.tsx`：应用的默认主页**仪表盘**（用户可自定义卡片，见第 8 节），侧边栏第一项（`nav.home`，文案「仪表盘」）对应 `/$appId/home`；
  - `$appId/$.tsx`：业务外壳内局部 404 兜底路由；
  - **模块目录化约定（强制）**：任何业务模块都必须以目录承载，禁止再新增扁平的 `$appId/xxx.tsx` 单文件模块。目录内 `route.tsx` 是该模块的根与边界（渲染 `<Outlet />`，承载模块级守卫/布局扩展点），模块入口用 `index.tsx`，模块下的子模块继续用子目录组织；模块私有、不参与路由的代码放在 `-` 前缀目录中（如 `-data/`、`-components/`），`@tanstack/router-plugin` 默认忽略 `-` 前缀。
  - 示例（用户运营模块）：`$appId/users/route.tsx`（模块根）→ `$appId/users/index.tsx`（重定向到默认子模块）→ `$appId/users/user/index.tsx`（用户列表 `/$appId/users/user`）→ `$appId/users/user/$uid.tsx`（用户详情 `/$appId/users/user/$uid`），私有数据与共享展示逻辑位于 `$appId/users/user/-data/`。
  - 子路由切换时外壳不重新挂载（Zero-Remount），页面切换仅替换内容区 `<Outlet />`；
  - 全局路由 pending / error / notFound 状态 (`apps/web/src/router.tsx`) 仅在 Outlet 内容区局部渲染，不破坏外壳；
  - `beforeLoad` 守卫：校验认证状态，并自动同步 URL 中的 `$appId` 与当前激活应用；若访问历史别名路径（如 `/admin`）会自动规范化重定向至 `/$appId/home`，若 appId 不存在则直接抛出 404 (`notFound()`) 并在 `_main` 通用外壳中呈现；
  - 面包屑计算：顶栏面包屑自动剔除开头的 `$appId` 参数，并按 `NAV_GROUPS` 做最长前缀匹配，剩余分段作为动态参数逐级追加（如 `/$appId/users/user` 显示为 `首页 / 用户运营 / 用户列表`，`/$appId/users/user/10001` 显示为 `首页 / 用户运营 / 用户列表 / 10001`）。
    - 剩余分段默认只显示**原始段**（如 `483`）。业务模块可在数据到达后用 `apps/web/src/lib/breadcrumb-trail.ts` 的 `setBreadcrumbTrail(owner, { [path]: { label, parent } })` 注册层级，`AppHeader` 命中后把它还原成**带名称、可逐级点击**的层级链（功能模块据此把 `/$appId/system/features/483` 显示为 `首页 / 系统 / 功能 / system / menus`，点 `system` 即回到 484）；按 `owner` 覆盖式注册、组件卸载即清除，未注册时行为完全不变。
- `_auth/route.tsx`：认证门户专用无路径布局 (`/login`)。右上角内置浮动语言与主题切换器。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— 路由与外壳

## 1. 多布局分层路由架构 (Multi-Layout Routing Architecture)

> **完整说明见 [.agents/docs/routing-architecture.md](./.agents/docs/routing-architecture.md)**：路由分层拓扑、
> 每个路由文件的职责、设置模块的侧边栏切换、外壳持久化（Zero-Remount）、面包屑与
> `setBreadcrumbTrail` 的注册机制。下面只列必须记住的。

- 路由在 `apps/web/src/routes/`，自动汇编成 `apps/web/src/routeTree.gen.ts`（**自动生成，禁止手改**）。
- **模块目录化（强制）**：业务模块一律用目录承载，**禁止再新增扁平的 `$appId/xxx.tsx`**。
  目录内 `route.tsx` 是模块根与边界（渲染 `<Outlet />`）、入口用 `index.tsx`、
  **私有代码放 `-` 前缀目录**（`router-plugin` 默认忽略）。
- 三套外壳：`__root.tsx`（全局，桥接 Kumo 链接 + Toast）/ `_main/`（与 appId 无关，含设置模块）/
  `$appId/`（业务外壳，承载 `AppShell`）。**子路由切换外壳不重挂**，只换 `<Outlet />`。
- `$appId/route.tsx` 的 `beforeLoad` 守卫：校验认证、同步 URL 的 `$appId` 与激活应用、
  历史别名（如 `/admin`）规范化重定向、appId 不存在直接 `notFound()`。
- **面包屑**剔除 `$appId` 并按 `NAV_GROUPS` 最长前缀匹配；剩余分段默认显示原始段，
  业务模块可用 `setBreadcrumbTrail(owner, …)` 注册成**带名称、可逐级点击**的层级链
  （按 `owner` 覆盖式注册、卸载即清除，未注册时行为不变）。

## 附：契约速查 —— 导航系统与命令面板

## 2. 导航系统与命令面板 (Navigation & Command Palette)

- `apps/web/src/lib/navigation.ts` 是管理后台所有导航项的**单一真值来源 (SSOT)**，共三份配置：
  - `NAV_GROUPS`：`$appId` 业务导航，`to` **相对 appId**（`/home`、`/users/user`）；由 `AppSidebar` 渲染、`AppHeader` 用它的 `to` 做面包屑最长前缀匹配，并经 `ALL_NAV_TARGETS` 扁平化后供命令面板使用；
  - `MAIN_NAV_ITEMS`：`_main` 通用外壳导航（应用选择 `/`、个人资料 `/settings/profile`），由 `MainSidebar` 渲染；
  - `SETTINGS_NAV_ITEMS`：设置模块的二级导航（个人资料 `/settings/profile`、外观 `/settings/appearance`（图标 `SwatchesIcon`、文案 `profileNav.appearance`）、AI `/settings/AI`（图标 `SparkleIcon`、文案 `profileNav.ai`，**路径保留大写缩写**）），由 `SettingsSidebar` 渲染。**「外观」与「主题」是两个 key**：前者是模块入口（`profileNav.appearance`），后者是主题选择器的分组标题（`theme.label`），不要合并。
  - 后两份是 `ShellNavItem`，`to` 是**绝对路径**（不拼 appId），并带 `matchPaths` 表达「历史别名也算选中」（如 `/select-app` 之于 `/`）。**不要把外壳项塞进 `NAV_GROUPS`** —— 会污染 `AppHeader` 的业务面包屑匹配，且 `_main` 外壳根本没有 appId 前缀。`ALL_SHELL_NAV_TARGETS` 是两份外壳导航合并去重后的命令面板数据源。
- **三处侧边栏与命令面板都必须是「配置对象 → map 渲染」**，不允许把菜单项硬编码在 JSX 里（`MainSidebar` 曾如此）：加 / 改导航项只动 `navigation.ts`，业务侧边栏、外壳侧边栏、⌘K 面板三个入口自动同步。外壳侧边栏统一走 `components/main-layout.tsx` 的 `ShellNavButton`。
- **导航项没有描述字段**：侧边栏与命令面板列表**只显示标题**（曾经给命令面板当副标题的 `description` 已删除，不要加回来）；检索能力靠 `keywords`（中英双语，保证两种输入都能命中）。
- 导航文案通过 `labelKey` / `children[].labelKey` 指向 `common` 命名空间下的 i18n 键，不要在组件里硬编码路径→文案的映射；新增导航项时同步补齐 7 种语言的 `nav.*` 文案。
- 业务首页路径统一配置为 `/home`，拼接当前激活应用标识生成 `/$appId/home`；它的**文案是「仪表盘」**（`nav.home`，7 语言已就位），别只改中文一处就以为改完了 —— 导航项、命令面板、顶栏面包屑三处共用这个 key。检索关键词同时保留 `home` / `首页` 与 `dashboard` / `仪表盘`（老用户还在按老名字找它）。
- **命令面板自身的文案也必须走 i18n**：`common:commandPalette.*`（placeholder / empty / 分组标题）；主题命令直接复用 **`theme.*`**（与 `UserMenu` 的「主题」子菜单同一套键），不要再写「切换到浅色主题」这类面板自有文案。
