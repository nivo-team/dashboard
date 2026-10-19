# 认证、多应用与国际化架构

本项目内置了完整的现代企业级后台支撑体系，涵盖统一认证、多应用工作空间选择以及模块化多语言。

---

## 1. 认证与多应用体系（Auth & Workspaces）

分三层，**各自只有一个真值**：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| **部署模式** | `apps/web/src/lib/app-config.ts` | 读环境变量，导出能力函数（单/多应用、单/多账号、选择策略、超管 id） |
| **状态机** | `apps/web/src/lib/store/auth-store.ts` | `useAuthStore`（zustand 5 + `persist`，键 `admin.auth-state`） |
| **对外 API** | `apps/web/src/lib/auth.ts` | 转出读写口 + 会话流程（`apiLogin` / `fetchAvailableApps` / `resolveAuthenticatedLanding`）+ 模块级副作用（拦截器、跨标签页同步） |

业务代码**只引 `#/lib/auth`**：认证怎么实现（store / 环境变量）与怎么被用不会缠在一起。
旧存档的裸对象格式在读取时就地升级，老会话不必重新登录。状态层与缓存分区的完整约定见 [store.md](./store.md)。

> `store/auth-store.ts` **刻意不进 `src/lib/store/index.ts` 那个桶** —— 它在模块初始化时会注册
> 请求拦截器与跨标签页同步，进桶会让每个引 `#/lib/store` 的底层模块连带触发这些副作用。

### 部署模式：两个正交维度，四种形态

前端**同一份产物**靠两个环境变量适配四种部署，代码里**不写 `if (模式 === 'xx')`**，
而是各读一个能力函数 —— 以后加维度不用改调用点。真值只在 `lib/app-config.ts`，
变量清单与注释在 `apps/web/.env.example`。

|                    | 单账号 `VITE_MULTI_ACCOUNT=false` | 多账号（默认） |
| --- | --- | --- |
| **单应用**（`VITE_MULTI_APP` 默认 false） | 内部管理台：一个应用、一个账号 | 小型 SaaS：单应用 + 开放注册 |
| **多应用** `VITE_MULTI_APP=true` | 平台内多工作空间，账号由管理员开 | 完整 SaaS：注册 + 多应用 |

| 函数（`#/lib/app-config`） | 读什么 | 决定什么 |
| --- | --- | --- |
| `isMultiAppEnabled()` | `VITE_MULTI_APP` | 有无 `/` 选择页、切换器、`GET /apps` 调用 |
| `shouldEnterAppSelect(appCount)` | `VITE_APP_SELECT_MODE`（`auto` / `always` / `never`）+ 实际应用数 | 登录后是否停在 `/` 选择 |
| `isMultiAccountEnabled()` | `VITE_MULTI_ACCOUNT` | 是否开放注册 / 找回；登录页是否引导注册 |
| `getAuthUiOptions()` | 上面 + `VITE_SHOW_DEMO_ACCOUNTS` | 登录页各区块的显隐（路由只透传，不自己判断） |
| `isConfiguredSuperAdmin(identity)` | `VITE_SUPER_ADMIN_ID` | 该身份是否算超管（uid 或登录名，忽略大小写） |
| `getDeploymentSnapshot()` | 以上全部 | 只读快照（关于页展示、排查用） |

**`auto` 是默认策略**：可用应用 ≤ 1 时直接进那个应用 —— 让用户点一次「只有一个选项」的选择页
没有意义。`appCount === undefined`（列表还没拉到）时按「进选择页」处理，避免误送进某个应用。

登录 / 注册 / 找回四处的 `beforeLoad` 共用 `resolveAuthenticatedLanding(auth, redirect)`，
**不要在路由里再写一遍落点推导**（`safeRedirectTarget` 防开放重定向也只在这一处）。

### 双阶段认证模型

```
[未登录用户]
    ↓ 访问任何页面被 $appId 或 _main 的 beforeLoad 守卫拦截
[登录门户 /auth/login]
    ↓ 验证账号密码（apiLogin），获得 Token、用户基础信息及可用应用列表 availableApps
[判定落点] ── shouldEnterAppSelect(apps.length) === false ──→ completeLoginWithApp(首个应用)
    │                                                            ↓
    │                                              [就绪阶段] /$appId/home
    ↓ true
[认证完成阶段 (isAuthenticated = true, currentApp = null)]
    ↓ 路由重定向到根路径 /
[应用选择页 / (根路径)]
    ↓ 用户点击选定应用系统（selectAppAndComplete）
[就绪阶段 (isAuthenticated = true, currentApp = AppItem)]
    ↓ 动态绑定选定应用的独立 apiBaseUrl，自动将 appId 编码进路径前缀
进入业务控制台 /$appId/home
```

单应用模式（`VITE_MULTI_APP=false`）没有第二阶段的交互：`/` 的 `beforeLoad` 直接重定向到
`/$DEFAULT_APP_ID/home`，`AppSwitcher` 退化成静态名称展示，侧边栏导航里的「应用」一项也被过滤掉
（见 `src/lib/navigation/shell-nav.ts` 的 `MAIN_NAV_ITEMS`）。

### 拦截器解耦与会话失效（Auth Interceptors）
通过 `configureAuthInterceptors` 机制将 API 请求/响应拦截器与认证状态解耦：
- **请求阶段**：动态拉取当前有效凭证，在请求标头中自动附加 `Authorization: Bearer <token>` 与当前选定应用的 `X-App-Id`；
- **响应阶段**：当服务端返回 401（未授权/凭证过期）时，触发 `logout()` 响应式通知清除前端状态并平滑重定向至 `/auth/login`；
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

**根路径 `/` 是「选择 + 管理」同一页**（`src/features/select-app`），按权限点分档：

- 有 `app:read`（只给超管）：读 `GET /app`（配置视角，含停用应用与管理字段），可增删改；
- 没有：读 `GET /apps`（工作空间视角，只含启用应用），只读、点行进应用。

**平台级能力（应用管理）不进 `$appId` 的菜单树** —— 后者是「某个应用里有哪些页面」，
而应用管理恰恰在应用之外。权限点由 `GET /permissions` 下发，接口层另有 403 兜底。

**`X-App-Id`（应用标识）**：`configureAuthInterceptors` 的 `getCredentials` 把当前应用的
`id` 直接交给 API 层，请求拦截器（`apps/web/src/api/index.ts`）发出 `Authorization` 与
`X-App-Id` 两个头。Mock 不区分该标识，所以两个应用看到同一份数据；
将来后端按它隔离数据时前端无需改动。

**切换应用的状态隔离**：每个应用一份 `QueryClient` 与一份持久化作用域
（`admin.preferences:<appId>` 这类键），**切换应用不清缓存** —— 切回来即时可见。
详见 [./store.md](./store.md)。

### 权限：前端不是安全边界

两套东西，别混：

1. **权限点**（真正的判据）：后端 `GET /permissions` 下发 `{module}:{action}`，
   落在 `src/lib/store/permission-store.ts`，读它只有 `useHasPermission()` / `hasPermission()`；
2. **菜单可见性**（`role_menus` + `GET /menus/navigation`）：本前端**尚未消费**，
   侧边栏目前是静态的 `src/lib/navigation/`（`MAIN_NAV_ITEMS` 在 `shell-nav.ts`）。

按钮级收敛用通用组件 `src/components/permission-guard.tsx`：

- `<Can permission="app:edit">…</Can>` —— 无权限时渲染 `fallback`（默认不渲染）；
- `<PermissionButton permission="app:delete" denied="disable">` —— 保留按钮但置灰。

判断条件（`isSuperAdmin` 的推导）只在 `permission-store` 的 `computePermissions()` 里写一次：
角色归一化成 `superadmin` / `super`、权限点里有 `*`、或身份命中 `VITE_SUPER_ADMIN_ID`，
三者任一即超管。**所有写接口都假设后端已鉴权**（mock 对超管接口回 403 就是这个约定）。

### 预设角色体验账号
登录页的「测试账号」下拉由 `VITE_SHOW_DEMO_ACCOUNTS` 控制（缺省跟随 `DEV`，构建产物默认不显示），
列表在 `src/features/auth/login-form.tsx` 的 `DEFAULT_DEMO_ACCOUNTS`。
真实部署下这些账号由后端提供，前端只负责把它填进表单，**不做任何鉴权判断**。

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
  - 文件名 `{lang}` 自动作为语言 Key（取值见 `SUPPORTED_LOCALES`，真值在 `apps/web/src/lib/locale.ts`）；
  - 默认命名空间为 `common`，支持组件内通过 `useTranslation('auth')` 引用模块专属翻译文本；
  - 针对阿拉伯语（`ar-SA`），系统会自动在 `document.documentElement` 设置 `dir="rtl"`，结合 Tailwind CSS 逻辑属性（如 `ms-*`、`me-*`、`pe-*`）实现无缝的双向排版适配；
  - 语言持久化于 `localStorage`（键名 `admin.locale`）。

## 登出的三个坑（顺序不能反）

1. **安全注销时序**：`logout()` 先带当前有效 Token 异步请求 `/logout`，再在 `finally` 里
   清理内存与持久化状态。反过来（先清状态）的话，这次请求既丢鉴权（拦截器拿不到 Token）
   也丢地址（`apiBaseUrl` 被重置回默认）。
2. **跳转收口在 `logout()` 末尾的 `redirectToLogin()`**（`window.location.replace('/auth/login')`，
   与 401 拦截器一致）。路由守卫只在**导航时**求值，把 `isAuthenticated` 置 false 不会自动
   把用户带离当前页；而若调用方在 `await logout()` **之前**就 `navigate('/auth/login')`，登录页的
   `beforeLoad` 会读到尚未清理的 `isAuthenticated === true`，又把人送回原页面 —— 症状是
   「登出请求成功却停在页面内」（`user-menu.tsx` 曾这么写）。**任何调用方都不要自行导航。**
3. `loggingOut` 模块级标志做并发 / 递归保护（401 → `logout()` → `/logout` 又 401 → …）。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— i18n

## 3. 独立语言包零配置国际化 (Modular i18n Pattern)

> 目录 / 命名空间规范、字典文案的分工与回落链、与 `/lang` 的边界见
> [.agents/skills/business-development/references/dict-i18n.md](../../business-development/references/dict-i18n.md)。

- `apps/web/src/lib/i18n.ts` 用 `import.meta.glob('/apps/web/src/messages/*/*.json', { eager: true })` 自动注册：
  **目录名 = 命名空间，文件名 = 语言码**。语言清单的真值在 `i18n.config.json`
  （`sourceLocale` + `targetLocales`），运行时与 `apps/web/src/lib/locale.ts` 的
  `SUPPORTED_LOCALES` 一致 —— **本文不列举具体语言**。
- **新契约：开发时只写源语言 `zh-CN`**，其它语言由翻译流水线补齐
  （`pnpm i18n`，带缓存、只翻增量）—— **不要手写其它语言**。
  写错键名用 `#/lib/use-typed-t` 的 `useT('ns')` 会在编译期报错。
  完整机制见 [i18n-translation-pipeline.md](../../platform-ops/references/i18n-translation-pipeline.md)。
- 语言 / 主题 / 时区等偏好持久化在 `admin.preferences:<appId>`（**按应用隔离**），
  所以**切换应用会切换语言**，这是刻意行为，不是 bug。
- **字典文案是另一套机制**（`apps/web/src/messages/dict/*`，按模块懒加载、**不进**上面的 eager glob）：
  枚举值一律用 `<DictItemText>` / `<DictText>` 渲染，**不要再写 `row.label`**；值域来自
  `#/lib/dict-options` 的 `useDictOptionList(...)`，显示文案来自字典文案库；
  `new.` 前缀的适配只在 `#/lib/dict-key.ts`。详见 [.agents/skills/business-development/references/dict-options.md](../../business-development/references/dict-options.md)。

## 附：契约速查 —— 认证与工作空间

## 4. 认证、工作空间与拦截器解耦 (Authentication & Workspace Apps)

> 应用池、预设角色账号与**登出的三个坑**（注销时序 / 跳转收口 / 并发保护）见
> [.agents/skills/platform-development/references/auth-and-i18n.md](./auth-and-i18n.md) 第 1 节；
> 外壳 UI 与 app 作用域的持久化分区见 [.agents/skills/platform-development/references/store.md](./store.md)。

- `apps/web/src/lib/store/auth-store.ts` 的 `useAuthStore`（zustand 5 + persist，键 `admin.auth-state`）是认证状态的
  **单一来源**，其读写口经 `#/lib/auth` 对外导出（`useAuth` / `getAuthSnapshot` / `selectAppAndComplete`）。
- **双阶段认证**：先凭据认证（此时 `currentApp` 为 null），再选定应用（绑定该应用的
  `apiBaseUrl` 并进 `/$appId/home`）。**没有第二步，业务接口不知道该打到哪个应用。**
- 拦截器**由 `configureAuthInterceptors` 注入**（`apps/web/src/api/index.ts` 不直接碰 localStorage）：
  请求自动带 `Authorization` 与 `X-App-Id`；401 触发响应式 `logout()`。
- **`logout()` 负责离开页面**，调用方**不要自行 `navigate('/auth/login')`**（会与还没清理的
  `isAuthenticated` 打架、把人送回原页面）。
- **切应用不清查询缓存**（每个 app 一份 `QueryClient`，物理隔离 → 切回来即时可见）；
  只有登录 / 登出 / 换账号这类**身份边界**才 `clearAllQueryCaches()`。
