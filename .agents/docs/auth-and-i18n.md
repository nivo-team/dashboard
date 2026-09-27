# 认证、多应用与国际化架构

本项目内置了完整的现代企业级后台支撑体系，涵盖统一认证、多应用工作空间选择以及模块化多语言。

---

## 1. 认证与多应用体系（Auth & Workspaces）

位于 `apps/web/src/lib/auth.ts` 的 `useAuthStore`（**zustand 5 + `persist`**，键仍是 `admin.auth-state`），支持多标签页状态同步与本地持久化。对外仍导出 `useAuth` / `getAuthSnapshot` / `selectAppAndComplete` 等既有 API，调用方无需感知实现；旧存档的裸对象格式在读取时就地升级，老会话不必重新登录。状态层与缓存分区的完整约定见 [store.md](./store.md)。

### 双阶段认证模型

```
[未登录用户]
    ↓ 访问任何页面被 $appId 或 _main 的 beforeLoad 守卫拦截
[登录门户 /login]
    ↓ 验证账号密码（apiLogin），获得 Token、用户基础信息及可用应用列表 availableApps
[认证完成阶段 (isAuthenticated = true, currentApp = null)]
    ↓ 路由重定向到根路径 /
[应用选择页 / (根路径)]
    ↓ 用户点击选定应用系统（selectAppAndComplete）
[就绪阶段 (isAuthenticated = true, currentApp = AppItem)]
    ↓ 动态绑定选定应用的独立 apiBaseUrl，自动将 appId 编码进路径前缀
进入业务控制台 /$appId/home
```

### 拦截器解耦与会话失效（Auth Interceptors）
通过 `configureAuthInterceptors` 机制将 API 请求/响应拦截器与认证状态解耦：
- **请求阶段**：动态拉取当前有效凭证，在请求标头中自动附加 `Authorization: Bearer <token>` 与当前选定应用的 `X-App-Id`；
- **响应阶段**：当服务端返回 401（未授权/凭证过期）时，触发 `logout()` 响应式通知清除前端状态并平滑重定向至 `/login`；
- **安全注销时序**：执行 `logout()` 时，先携带当前有效 Token 异步通知后端 `/logout` 接口，在 `finally` 阶段统一重置内存与持久化状态，避免提前抹除 Token 导致注销接口报 401。

### 应用池（App Pool）

**应用列表由接口下发**：`GET /apps`（由 `apps/mock` 提供）返回当前账号可用的应用，
每个应用自带自己的 `apiBaseUrl`。登录成功后由 `fetchAvailableApps()` 拉取并写入认证状态
（`useAuthStore.availableApps`）—— **没有任何静态应用池**，`$appId` 守卫与
`selectAppAndComplete` 都只认这一份列表。

字段分两类：

- **服务端下发**：`id` / `name` / `headline` / `description` / `domain` / `apiBaseUrl` /
  `badge` / `category` / `themeGradient`；
- **前端呈现资源**：`icon`（Phosphor 组件无法走 JSON）在
  `apps/web/src/lib/app-registry.ts` 的 `APP_ICONS` 里按 `id` 映射，没配的 id 回落默认图标；
  `iconWeight` 同理。两者**都不写入本地认证存档**，否则改配置会被旧会话的存档顶回去。

**加一个应用**：在 mock 的 `apps` 数据里加一条 → 在 `APP_ICONS` 补一个图标映射。

**`X-App-Id`（应用标识）**：`configureAuthInterceptors` 的 `getCredentials` 把当前应用的
`id` 直接交给 API 层，请求拦截器（`apps/web/src/api/index.ts`）发出 `Authorization` 与
`X-App-Id` 两个头。Mock 不区分该标识，所以两个应用看到同一份数据；
将来后端按它隔离数据时前端无需改动。

**切换应用的状态隔离**：每个应用一份 `QueryClient` 与一份持久化作用域
（`admin.preferences:<appId>` 这类键），**切换应用不清缓存** —— 切回来即时可见。
详见 [./store.md](./store.md)。

### 预设角色体验账号
登录界面内置了一键体验账号体系：
- **admin**（超级管理员）：全量授权系统（Admin Console、Data Analytics、System & IAM、Commerce）；
- **analyst**（商业分析师）：数据中台与基础后台权限；
- **operator**（运维工程师）：系统与安全平台与基础后台权限。

---

## 2. 独立语言包零配置国际化（Messages i18n）

位于 `apps/web/src/lib/i18n.ts`，基于 `i18next` 与 `react-i18next`。

### 目录与命名空间规范
所有语言资源统一归集在独立的 `apps/web/src/messages/` 目录下，无需手动导入注册各模块的语言包，通过 Vite 的 `import.meta.glob('/apps/web/src/messages/*/*.json')` 自动扫描动态注册：

```
apps/web/src/messages/
├── common/
│   ├── zh-CN.json     # 对应命名空间 common
│   ├── en-US.json
│   ├── ja-JP.json
│   ├── ar-SA.json     # 阿拉伯语（自动启用 RTL 布局）
│   ├── hi-IN.json     # 印地语
│   ├── es-ES.json     # 西班牙语
│   └── tr-TR.json     # 土耳其语
└── auth/
    ├── zh-CN.json     # 对应命名空间 auth
    ├── en-US.json
    ├── ja-JP.json
    ├── ar-SA.json
    ├── hi-IN.json
    ├── es-ES.json
    └── tr-TR.json
```

- **路径规则**：`/apps/web/src/messages/{module}/{lang}.json`
- **解析机制**：
  - 目录名 `{module}` 自动作为 i18n 的 Namespace（如 `auth`、`common`）；
  - 文件名 `{lang}` 自动作为语言 Key（`zh-CN`、`en-US`、`ja-JP`、`ar-SA`、`hi-IN`、`es-ES`、`tr-TR`）；
  - 默认命名空间为 `common`，支持组件内通过 `useTranslation('auth')` 引用模块专属翻译文本；
  - 针对阿拉伯语（`ar-SA`），系统会自动在 `document.documentElement` 设置 `dir="rtl"`，结合 Tailwind CSS 逻辑属性（如 `ms-*`、`me-*`、`pe-*`）实现无缝的双向排版适配；
  - 语言持久化于 `localStorage`（键名 `admin.locale`）。

## 登出的三个坑（顺序不能反）

1. **安全注销时序**：`logout()` 先带当前有效 Token 异步请求 `/logout`，再在 `finally` 里
   清理内存与持久化状态。反过来（先清状态）的话，这次请求既丢鉴权（拦截器拿不到 Token）
   也丢地址（`apiBaseUrl` 被重置回默认）。
2. **跳转收口在 `logout()` 末尾的 `redirectToLogin()`**（`window.location.replace('/login')`，
   与 401 拦截器一致）。路由守卫只在**导航时**求值，把 `isAuthenticated` 置 false 不会自动
   把用户带离当前页；而若调用方在 `await logout()` **之前**就 `navigate('/login')`，登录页的
   `beforeLoad` 会读到尚未清理的 `isAuthenticated === true`，又把人送回原页面 —— 症状是
   「登出请求成功却停在页面内」（`user-menu.tsx` 曾这么写）。**任何调用方都不要自行导航。**
3. `loggingOut` 模块级标志做并发 / 递归保护（401 → `logout()` → `/logout` 又 401 → …）。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— i18n

## 3. 独立语言包零配置国际化 (Modular i18n Pattern)

> 目录 / 命名空间规范、字典文案的分工与回落链、与 `/lang` 的边界见
> [.agents/docs/auth-and-i18n.md](./.agents/docs/auth-and-i18n.md) 第 2 节与 [.agents/docs/dict-i18n.md](./.agents/docs/dict-i18n.md)。

- `apps/web/src/lib/i18n.ts` 用 `import.meta.glob('/apps/web/src/messages/*/*.json', { eager: true })` 自动注册：
  **目录名 = 命名空间，文件名 = 语言码**。全量支持 7 种语言（zh-CN / en-US / ja-JP / ar-SA /
  hi-IN / es-ES / tr-TR）—— **新增任何用户可见文案都要补齐 7 份，只改中文等于没改**。
- 语言 / 主题 / 时区等偏好持久化在 `admin.preferences:<appId>`（**按应用隔离**），
  所以**切换应用会切换语言**，这是刻意行为，不是 bug。
- **字典文案是另一套机制**（`apps/web/src/messages/dict/*`，按模块懒加载、**不进**上面的 eager glob）：
  枚举值一律用 `<DictItemText>` / `<DictText>` 渲染，**不要再写 `row.label`**；值域来自
  `#/lib/dict-options` 的 `useDictOptionList(...)`，显示文案来自字典文案库；
  `new.` 前缀的适配只在 `#/lib/dict-key.ts`。详见 [.agents/docs/dict-options.md](./.agents/docs/dict-options.md)。

## 附：契约速查 —— 认证与工作空间

## 4. 认证、工作空间与拦截器解耦 (Authentication & Workspace Apps)

> 应用池、预设角色账号与**登出的三个坑**（注销时序 / 跳转收口 / 并发保护）见
> [.agents/docs/auth-and-i18n.md](./.agents/docs/auth-and-i18n.md) 第 1 节；
> 外壳 UI 与 app 作用域的持久化分区见 [.agents/docs/store.md](./.agents/docs/store.md)。

- `apps/web/src/lib/auth.ts` 的 `useAuthStore`（zustand 5 + persist，键 `admin.auth-state`）是认证状态的
  **单一来源**，对外导出 `useAuth` / `getAuthSnapshot` / `selectAppAndComplete`。
- **双阶段认证**：先凭据认证（此时 `currentApp` 为 null），再选定应用（绑定该应用的
  `apiBaseUrl` 并进 `/$appId/home`）。**没有第二步，业务接口不知道该打到哪个应用。**
- 拦截器**由 `configureAuthInterceptors` 注入**（`apps/web/src/api/index.ts` 不直接碰 localStorage）：
  请求自动带 `Authorization` 与 `X-App-Id`；401 触发响应式 `logout()`。
- **`logout()` 负责离开页面**，调用方**不要自行 `navigate('/login')`**（会与还没清理的
  `isAuthenticated` 打架、把人送回原页面）。
- **切应用不清查询缓存**（每个 app 一份 `QueryClient`，物理隔离 → 切回来即时可见）；
  只有登录 / 登出 / 换账号这类**身份边界**才 `clearAllQueryCaches()`。
