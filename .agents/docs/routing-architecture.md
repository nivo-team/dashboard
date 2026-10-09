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
│   │   ├── profile.tsx        #     个人资料 (/settings/profile)：薄路由，页面在 features/settings/profile.tsx
│   │   └── appearance.tsx     #     外观 (/settings/appearance)：薄路由，页面在 features/settings/appearance.tsx
│   └── $.tsx                  #   _main 外壳内局部 404 兜底路由
└── $appId/                    # 业务控制台应用前缀（参数化动态应用路由，去除了中间冗余 _app）
    ├── route.tsx              #   AppShell 外壳：侧边栏 + 顶栏 + ⌘K 面板（App 校验、同步与规范化）
    ├── index.tsx              #   访问 /$appId 自动重定向至默认首页 /$appId/home
    ├── home/                  #   /$appId/home 业务仪表盘默认首页（目录化模块）
    ├── example/               #   /$appId/example 示例（表格示例 / 复杂表格）
    ├── system/                #   /$appId/system 系统（功能 / 数据字典）
    └── $.tsx                  #   外壳内局部 404 页面
└── $appId_.sphere/            # 全屏 AI 对话页 /$appId/sphere（**逃离 $appId 布局**，无应用侧边栏）
    ├── route.tsx              #   全屏布局：守卫 + 会话侧边栏 + 圆角 chat 面板（<Outlet />）
    │                          #     面板的进出场动画也在这一层（scale + 透明度）
    ├── index.tsx              #   /$appId/sphere        新会话
    ├── chat/$chatId.tsx       #   /$appId/sphere/chat/$chatId  指定会话（找不到 → 404）
    └── （页面实现在 src/features/ai/sphere/：sphere-chat / sphere-sidebar / session-search-dialog）
```

> **模块目录化（强制）**：业务模块一律用目录承载（`route.tsx` = 模块根与边界、`index.tsx` = 入口）；
> 私有实现不放路由目录，而是**平铺在 `src/features/<页面目录>/`**（一页一目录，见 features-architecture.md）。
> 上面 `home/`、`example/`、`system/` 都是这套约定；`$appId_.sphere/`
> 是同一个模块，只是用段尾下划线逃离了 `$appId` 布局 —— 见 §2「逃离父布局」。

---

## 2. 核心架构机制

### 双层外壳拓扑：_main 与 $appId 隔离
- **全局通用外壳 (`_main/`)**：处理与具体应用无关的通用业务，例如工作空间应用列表选择 (`/`)、个人资料 (`/settings/profile`) 等。
- **业务控制台外壳 (`$appId/`)**：扁平化去除了多余的 `_app` 中间层，直接由 `apps/web/src/routes/$appId/route.tsx` 承载 `AppShell`。每个应用系统享有隔离的 URL 空间 `/$appId/...`，路由守卫自动根据 URL 参数同步激活当前 App 及其专属的 `apiBaseUrl`。
- **单应用 vs 多应用模式（环境变量可配）**：
  - **单应用模式（默认，`VITE_MULTI_APP=false`）**：
    - 访问 `/` 路由或登录成功后，无需调用 `GET /apps` 接口，守卫自动重定向到默认应用路由（如 `/$DEFAULT_APP_ID/home`，默认 `nivo`）；
    - 保持原有的 IndexedDB 与 localStorage 存储架构不变，仍以默认应用 ID 作为作用域隔离基准；
    - 通用外壳与侧边栏自动隐藏「应用选择」项，应用切换器转为纯静态应用名展示，流程极简。
  - **多应用模式（`VITE_MULTI_APP=true`）**：
    - 开启工作空间应用选择页 (`/`) 与侧边栏多应用切换器，调用 `GET /apps` 动态载入多应用列表。
- **默认首页与智能面包屑**：
  - 应用默认首页统一规范为 `/$appId/home`（访问 `/$appId` 自动重定向）；
  - 顶栏面包屑自动剥离第一段 `$appId` 参数，使业务层级链路清晰直观（如 `/$appId/home` 显示为 `首页`，`/$appId/orders` 显示为 `首页 / 订单管理`）；
  - 历史别名路径（如 `/admin`）会自动规范化重定向至 `/$appId/home`；
  - 未知应用校验：若 URL 中指定的 `$appId` 不在可用应用列表与系统预设中，路由守卫直接抛出 `notFound()` 并在 `_main` 通用外壳中呈现 404 引导页，使用户仍可通过完整的导航与侧边栏回到工作空间。

### 逃离父布局：全屏 AI 对话页（`$appId_.sphere`）
`/$appId/sphere` 是 AI 面板头行「最大化」按钮的落点：一个**没有应用侧边栏**的独立
chat 页面，自己的侧边栏是 AI 会话列表。

它**不是** `$appId` 布局的子路由 —— 否则会一并继承 `AppShell` 的侧边栏、顶栏与面板。
用的是 TanStack Router 的「**段尾下划线**」约定：目录名写成 `$appId_.sphere`，
`$appId` 那一段就不再和 `$appId/route.tsx` 布局嵌套，路由挂到根布局下，
但 URL 仍是 `/$appId/sphere`（`tsr generate` 会把它生成为 `id: '/$appId_/sphere'`、
`path: '/$appId/sphere'`，**文件名里的下划线是约定，不是 URL 的一部分**）。

由此带来两条必须记住的后果：

1. **守卫要自己接**：拿不到 `$appId/route.tsx` 的 `beforeLoad`，必须在自己的
   `beforeLoad` 里调用 `#/lib/app-route-guard` 的 `guardAppRoute`（认证 + appId 校验 +
   激活应用同步）。**两处共用同一个函数**，不要各写一份 —— 它同时也是 `AppShell` 的守卫。
2. **外壳桥要自己注册**：`AppShell` 里给 AI 工具层的 `registerAiShellBridge`
   （`navigate` / `getRoutePath`）不会跟着过来，`$appId_.sphere/route.tsx` 里重新注册一次
   （两者互斥挂载，单槽注册不会互相覆盖）。

AI 状态（`features/ai/core/session-store`）是模块级 zustand store，与路由无关，
所以面板「最大化」到本页时当前这段对话**原样续上**，不存在两套会话。
「最大化」的落点按**面板里有没有会话**分两种：有 → `sphere/chat/$chatId`，没有 → `sphere/`。

页面自身的结构（`$appId_.sphere/`）：

- `route.tsx`：最外层 `h-svh bg-kumo-canvas p-2`（整页留一圈内边距），里面是
  `Sidebar.Provider`（Kumo，`contained` + `variant="inset"` + `collapsible="offcanvas"`）——
  **侧边栏与 chat 区共用同一块 `rounded-xl border` 面板**；内外分隔线由侧边栏自己按开合
  画（`variant="inset"` 让 Kumo 不加 `border-e`，否则收起后会剩一条悬空竖线）。
  这里还统一加载会话列表
  （`loadHistory({ fresh: true })`，只拉列表、**不恢复**上一次的会话）并挂 ⌘K 的
  `CommandPaletteDialog`；
- `index.tsx`：`/$appId/sphere` = **新会话**（挂载即 `startNewSession()`）；
- `chat/$chatId.tsx`：`/$appId/sphere/chat/$chatId` = **指定会话**。loader 先确认这条
  记录在当前应用里存在，不存在 `throw notFound()` → `SphereNotFound`（AI 形象 + 文案，
  **不用**通用线框 404）；存在才让组件把 store 切过去（`activeSessionId` 已一致时不切，
  避免把流式增量冲掉）；
- `features/ai/sphere/sphere-header.tsx`：**头行挂在布局上**（三列等宽网格 → 标题居中，行首是
  侧边栏收起时才出现的展开按钮、行尾是「收起」）。放在布局而不是页面里，是为了让会话 404
  也留着头行（`notFoundComponent` 只替换路由组件）；标题因此按路由推导 ——
  `sphere/` 用当前会话，`sphere/chat/$chatId` 从会话列表按 id 取，**列表里没有就留空**
  （这正是「404 时 header 还在、只是不显示内容」）；
- `features/ai/sphere/sphere-chat.tsx`：两个路由共用的 chat 本体（**只有会话区 + 输入区**），
  输入区上沿不画分隔线；会话区用与面板共用的 `AiConversationScroller`（跟随滚动 / 回到底部）；
  宽度档位见设置 → AI → 页面宽度（`#/lib/page-width` 的 `aiChatWidthClass`：跟随外观 /
  全宽 / 限宽居中，上限是 `max-w-4xl`）——**约束挂在「内容」那一层，滚动容器仍铺满**，
  滚动条才始终贴在面板边缘（限宽模式下也是）；配合 `scrollbar-gutter: stable both-edges`
  让内容不跳动、中心与下方输入区对齐；
- `features/ai/sphere/use-sphere-collapse.ts`：收起全屏 = 回到**点「最大化」时所在的那一页**
  （href 记在 sessionStorage，见 `#/features/ai/core/panel-session`；没有记录才回落应用首页）；
- `features/ai/sphere/sphere-not-found.tsx`：会话 404 的空态（AI 形象 + 文案 + 「新对话」）；
  头行还在，所以这里不再重复放「收起」；
- `features/ai/sphere/sphere-sidebar.tsx`：Kumo `Sidebar` 组件写的会话侧边栏，头行 = 品牌 + 标题 +
  **展开态下的收起按钮**；内外分隔线也归它（展开时才画 `border-e`，收起后随整列一起消失）；
  会话选择走 **URL 导航**而不是直接调 store（一个落点只有一个所有者）；
  收起按钮**一次只显示一个**：展开态在侧边栏头行、收起态在 chat 头行；
- `features/ai/sphere/session-search-dialog.tsx`：只搜会话标题的独立弹窗，形态同命令面板。

### 外壳持久化（Zero-Remount）
`AppShell` 与 `MainLayout` 分别挂载在 `$appId/route.tsx` 和 `_main/route.tsx` 上。子路由切换时：
- 侧边栏折叠状态、拖拽宽度、内部滚动位置**完全保留**；
- 页面仅在 `<Outlet />` 区域替换组件，避免整页闪烁与重复渲染。

### 桌面壳里的外壳形态（窗口条 + 页面标签页）
在桌面壳里（`isDesktop()`，标记来自 URL，见 [apps/desktop/README.md](../../apps/desktop/README.md)）
两个外壳都换一种形态：**窗口条**（`#/components/desktop-title-bar`）取代顶栏，
横跨整个窗口排在侧边栏与内容列那一行**之上** —— 左侧是**页面标签条**
（`#/components/page-tab-strip`：已打开的页面 + 「+」页面菜单），右侧是原本顶栏的行末工具区
（`HeaderActions`）。于是外壳从「侧边栏 + 内容列」变成「窗口条 + 那一行」：

- **窗口条由谁排**：`#/components/shell-sidebar-provider` 的 `topBar` —— Kumo 的
  `Sidebar.Provider` 自己就是这个 flex 行，窗口条只能在它外面，所以那一层在有窗口条时是
  `flex h-svh flex-col`、没有时是 `display: contents`（多出来的 div 不产生盒子，
  浏览器里的布局与改动前一致）；
- **顶栏不再渲染**（`AppHeader` / `MainHeader`）：窗口条与它是同一份 chrome 的两种形态，
  不是两行。唯一例外是「桌面壳 + 移动视口」（窗口被拖到 768px 以下）：抽屉的汉堡按钮只能
  待在顶栏里，那时把顶栏渲染回来，工具区也只留一份；
- **标签页的真值**在 `#/lib/page-tabs`：一个标签 = 导航清单里的一项（`NAV_GROUPS` /
  `ALL_SHELL_NAV_TARGETS` 的最长前缀命中），所以 `/$appId/system/menus/483` 与
  `/$appId/system/menus` 共用「菜单管理」这一个标签，**加页面不用动标签代码**；
  标签集合只在内存里（刷新后从当前页重新开始，不落盘）；
- **高度**：窗口条 44px，侧边栏与两个面板列都按 `--shell-chrome-h` 扣掉它 ——
  见 [ui-and-styling.md](./ui-and-styling.md) §4。

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
  - `_main/index.tsx`：根路径 (`/`)。在多应用模式下承载工作空间应用选择页 (`SelectAppPage`)；在单应用模式下（默认），通过 `beforeLoad` 直接规范化重定向至默认应用首页 (`/nivo/home`，由 `DEFAULT_APP_ID` 配置)，无需接口请求与选应用流程。
  - `_main/select-app.tsx`：兼容历史 `/select-app` 路径，规范化重定向至根路径 `/`。
  - `_main/settings/`：设置模块（**目录化**，与 `/` 共用 `MainLayout`；当前「个人资料 / 外观 / AI」三个子页）。
    - `settings/route.tsx`：模块根，只渲染 `<Outlet />`；`settings/index.tsx` 把 `/settings` 重定向到默认子页 `/settings/profile`（与 `$appId/example/` 同一套写法）。**设置模块的二级导航由 `MainLayout` 的 `MainSidebarSwitch` 按路由前缀切换**（`/settings`、`/settings/**` → `SettingsSidebar`，其余 → 通用导航）—— 嵌套路由只能替换内容区，无法接管外层侧边栏。两套导航共用品牌 Header（`SidebarBrandHeader`：方块 + 标题 + 移动端关闭按钮）与「快速搜索」入口（`SidebarSearchButton`，与 `AppSidebar` 同一套 Kumo 官方范式）；`SettingsSidebar` 在品牌行之下再加一行 `SettingsModuleHeader`（返回 `/` + 模块标题「设置」，参照 Cloudflare 控制台），**真正替换的只有模块行与菜单**。这是「同一 Sidebar 位置换内容」而非第二个 `Sidebar`，`Sidebar.Provider` 不重挂，折叠状态与拖拽宽度都保留。`_main` 外壳已挂 `CommandPaletteDialog`（⌘K / Ctrl+K，与 `AppShell` 同款接线），搜索按钮与快捷键共享同一面板。
    - `settings/profile.tsx`：个人资料 (`/settings/profile`)，只读展示 `GET /profile` 返回的账号资料与区域权限 —— 接口路径与前端路由无关，仍是同一支接口；后端没有更新接口，因此不做表单；接口不可用时逐项回落本地登录态（`useAuth().user`）并显式提示，不把兜底数据伪装成后端值。
    - `settings/appearance.tsx`：外观 (`/settings/appearance`)，单张 `LayerCard`（标题「通用设置」`profile.settings.general`，形态是 `LayerCard.Secondary` + `LayerCard.Primary`）里放着**五项**本机偏好：主题（`#/lib/use-color-mode`）/ 语言（`#/lib/use-locale`）/ 时区（`#/lib/timezone`）/ 详情打开方式（`#/lib/store` 的 `detailOpenMode`，见 [./detail-preview.md](./detail-preview.md)）/ 页面宽度（`#/lib/store` 的 `pageWidth`：全宽 / 限宽居中，默认全宽，落点在 `#/lib/page-width`）—— 五者都是**即时生效 + 持久化在 `admin.preferences:<appId>`（按应用隔离，见 [./store.md](./store.md)）**，所以**没有保存按钮、没有 dirty 状态，不要套 `UnsavedChangesBar` 那套编辑态契约**。控件选型：**短枚举（≤3 项）用 Kumo `Tabs` 的 segmented 分段控件**（主题、详情打开方式、页面宽度），长枚举（语言 7 项、时区 8 项）用 `Select`；**「详情打开方式」与「页面宽度」每段选项悬浮时还会弹一个浮层，用通用缩略图把该档位的页面变化演一遍**（`#/components/app-shell-preview`，见第 5 节）。账号安全 / 已连接应用 / API Token 等更重的设置后续扩展（往 `components/main-layout.tsx` 的 `SETTINGS_NAV_ITEMS` 追加导航项、或在卡片下方再加一张 `LayerCard` 即可）。
    - `settings/AI.tsx`：AI (`/settings/AI`)，与外观页同一套「设置卡片 + 设置行」形态（`#/components/settings-card` 的 `SettingsCard` / `SettingRow`，不要再手写 `LayerCard`）。设置行有若干项，其中**显示方式**（`admin.preferences:<appId>` 的 `aiPanelMode`，`split` = Split View / `float` = Float）与**页面宽度**（`aiPageWidth`：跟随外观 / 全宽 / 限宽居中 —— **只作用于 `/$appId/sphere`**，会话区 + 输入区收在同一个宽度约束里；上限是聊天自己的 `max-w-4xl`，**比页面的 1440px 窄**，「跟随外观」只跟外观那个选择的档，落点见 `#/lib/page-width` 的 `aiChatWidthClass`）—— 与外观页同属「即时生效 + 按应用隔离持久化」，**没有保存按钮、没有 dirty 状态**。控件是与「主题」一致的分段控件（`Tabs` + `role="group"` 兜可访问名称），并带与「详情打开方式」同款的悬浮预览（见第 5 节；页面宽度那一行直接复用外观页的宽度缩略图动画）。**卡片标题直接复用 `profile.settings.general`（「通用设置」），不另开 `aiSection` 之类的重复文案**；设置项文案在 `profile.settings.aiDisplayMode*`，**两个选项（`aiModes.split` / `aiModes.float`）是形态名、7 语言各自本地化**（中文「分屏视图 / 浮窗」，不要写成产品术语原文）。后续 AI 偏好继续往这张卡片加 `SettingRow`，或下方再加一张 `SettingsCard`。**文件名与路径保留大写的 `AI`**（缩写，与导航项显示名一致），由 `pnpm generate-routes` 生成的 `routeTree.gen.ts` 同步。
    - 入口：侧边栏「个人资料」与顶栏 `UserMenu` 的 Profile 项（都指向 `/settings/profile`）；默认文案：中文「个人资料」、英文「Profile」（日语 `プロフィール`）。
  - `_main/$.tsx`：`_main` 外壳内局部 404 兜底路由；全局挂载 `notFoundComponent: NotFound`。
- `$appId/`：与特定应用强绑定的动态业务路由体系（**模块目录化**，每个业务模块独占一个目录）。
  - `$appId/route.tsx`：业务控制台外壳布局（承载 `AppShell`：侧边栏、顶部导航条、面包屑、⌘K 命令面板）；
  - `$appId/index.tsx`：访问 `/$appId` 根路径时自动重定向至默认主页 `/$appId/home`；
  - `$appId/home/index.tsx`：应用的默认主页**仪表盘**（用户可自定义卡片，见第 8 节），侧边栏第一项（`nav.home`，文案「仪表盘」）对应 `/$appId/home`；
  - `$appId/$.tsx`：业务外壳内局部 404 兜底路由；
  - **业务代码在 `src/features/**`**（新架构）：路由目录只留薄适配（`createFileRoute` + 守卫 / `validateSearch` + 取参 + 渲染 feature 组件），
    页面组件与 AI 声明（`feature.ts`）放 `src/features/<页面目录>/`（一页一目录、平铺，**不按路由层级建目录**）—— 见 [features-architecture.md](./features-architecture.md)。
    `-components/` / `-data/` **不再新增**，且 `src/features/**` 下面**不再按域嵌套子目录**（一页一目录，直接平铺在 `features/` 下）。
  - **模块目录化约定（强制）**：任何业务模块都必须以目录承载，禁止再新增扁平的 `$appId/xxx.tsx` 单文件模块。目录内 `route.tsx` 是该模块的根与边界（渲染 `<Outlet />`，承载模块级守卫/布局扩展点），模块入口用 `index.tsx`，模块下的子模块继续用子目录组织；**页面实现不放在路由目录**，而是平铺在 `src/features/<页面目录>/`（一页一目录），路由文件只做 `createFileRoute` + 守卫 / `validateSearch` + 取参 + 渲染组件。
  - 示例（示例模块）：`$appId/example/route.tsx`（模块根）→ `$appId/example/index.tsx`（重定向到默认子页 `/example/user`）→ `$appId/example/user/index.tsx`（表格示例）→ `$appId/example/user/$id.tsx`（表格示例详情）；另一页 `$appId/example/complex-table/index.tsx`（复杂表格）。页面实现全在 `src/features/table-example/` 与 `src/features/complex-table/`（平铺）。
  - 子路由切换时外壳不重新挂载（Zero-Remount），页面切换仅替换内容区 `<Outlet />`；
  - 全局路由 pending / error / notFound 状态 (`apps/web/src/router.tsx`) 仅在 Outlet 内容区局部渲染，不破坏外壳；
  - `beforeLoad` 守卫：校验认证状态，并自动同步 URL 中的 `$appId` 与当前激活应用；若访问历史别名路径（如 `/admin`）会自动规范化重定向至 `/$appId/home`，若 appId 不存在则直接抛出 404 (`notFound()`) 并在 `_main` 通用外壳中呈现；
  - 面包屑计算：顶栏面包屑自动剔除开头的 `$appId` 参数，并按 `NAV_GROUPS` 做最长前缀匹配，剩余分段作为动态参数逐级追加（如 `/$appId/example/user` 显示为 `首页 / 示例 / 表格示例`，`/$appId/example/user/10001` 显示为 `首页 / 示例 / 表格示例 / 10001`）。
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
  **守卫本体在 `#/lib/app-route-guard` 的 `guardAppRoute`**，逃离外壳的
  `$appId_.sphere` 也调同一份。
- **逃离父布局**：`/$appId/sphere`（全屏 AI 对话页）用目录名 `$appId_.sphere`
  （段尾下划线）挂到根布局下，URL 不变但**不继承 `AppShell`**；代价是守卫与
  `registerAiShellBridge` 都要自己接一遍。子路由：`sphere/` = 新会话、
  `sphere/chat/$chatId` = 指定会话（loader 校验不到 → 404）。
- **面包屑**剔除 `$appId` 并按 `NAV_GROUPS` 最长前缀匹配；剩余分段默认显示原始段，
  业务模块可用 `setBreadcrumbTrail(owner, …)` 注册成**带名称、可逐级点击**的层级链
  （按 `owner` 覆盖式注册、卸载即清除，未注册时行为不变）。

## 附：契约速查 —— 导航系统与命令面板

## 2. 导航系统与命令面板 (Navigation & Command Palette)

- `apps/web/src/lib/navigation.ts` 是管理后台所有导航项的**单一真值来源 (SSOT)**，共三份配置：
  - `NAV_GROUPS`：`$appId` 业务导航，`to` **相对 appId**（`/home`、`/example/user`）；由 `AppSidebar` 渲染、`AppHeader` 用它的 `to` 做面包屑最长前缀匹配，并经 `ALL_NAV_TARGETS` 扁平化后供命令面板使用；
  - `MAIN_NAV_ITEMS`：`_main` 通用外壳导航（应用选择 `/`、个人资料 `/settings/profile`），由 `MainSidebar` 渲染；
  - `SETTINGS_NAV_ITEMS`：设置模块的二级导航（个人资料 `/settings/profile`、外观 `/settings/appearance`（图标 `SwatchesIcon`、文案 `profileNav.appearance`）、AI `/settings/AI`（图标 `SparkleIcon`、文案 `profileNav.ai`，**路径保留大写缩写**）），由 `SettingsSidebar` 渲染。**「外观」与「主题」是两个 key**：前者是模块入口（`profileNav.appearance`），后者是主题选择器的分组标题（`theme.label`），不要合并。
  - 后两份是 `ShellNavItem`，`to` 是**绝对路径**（不拼 appId），并带 `matchPaths` 表达「历史别名也算选中」（如 `/select-app` 之于 `/`）。**不要把外壳项塞进 `NAV_GROUPS`** —— 会污染 `AppHeader` 的业务面包屑匹配，且 `_main` 外壳根本没有 appId 前缀。`ALL_SHELL_NAV_TARGETS` 是两份外壳导航合并去重后的命令面板数据源。
- **三处侧边栏与命令面板都必须是「配置对象 → map 渲染」**，不允许把菜单项硬编码在 JSX 里（`MainSidebar` 曾如此）：加 / 改导航项只动 `navigation.ts`，业务侧边栏、外壳侧边栏、⌘K 面板三个入口自动同步。外壳侧边栏统一走 `components/main-layout.tsx` 的 `ShellNavButton`。
- **导航项没有描述字段**：侧边栏与命令面板列表**只显示标题**（曾经给命令面板当副标题的 `description` 已删除，不要加回来）；检索能力靠 `keywords`（中英双语，保证两种输入都能命中）。
- 导航文案通过 `labelKey` / `children[].labelKey` 指向 `common` 命名空间下的 i18n 键，不要在组件里硬编码路径→文案的映射；新增导航项时同步补齐 7 种语言的 `nav.*` 文案。
- 业务首页路径统一配置为 `/home`，拼接当前激活应用标识生成 `/$appId/home`；它的**文案是「仪表盘」**（`nav.home`，7 语言已就位），别只改中文一处就以为改完了 —— 导航项、命令面板、顶栏面包屑三处共用这个 key。检索关键词同时保留 `home` / `首页` 与 `dashboard` / `仪表盘`（老用户还在按老名字找它）。
- **命令面板自身的文案也必须走 i18n**：`common:commandPalette.*`（placeholder / empty / 分组标题）；主题命令直接复用 **`theme.*`**（与 `UserMenu` 的「主题」子菜单同一套键），不要再写「切换到浅色主题」这类面板自有文案。
