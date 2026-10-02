# 权限体系（现状与规范）

> 什么时候读：**加一个需要权限的页面 / 按钮 / 菜单 / AI 工具之前**，
> 或要改「谁能看到什么」的判定规则时。
>
> 一句话：**判定只有一处**（`hasPermission`），其余全是它的调用方。

## 1. 真值链

```
mock 账号真值表                    前端权限 store                    各过滤入口
apps/mock/server/utils/           apps/web/src/lib/store/          ┌ 侧边栏 filterNavGroups
  mock-accounts.ts  ──token──▶      permission-store.ts  ──context─▶├ 命令面板 filterNavTargets
        │                            （per-app 持久化 + 预计算）      ├ 外壳导航 filterShellNavItems
        ├─ login.post.ts 签发 token                                 ├ 路由守卫 guardRoutePermission
        ├─ permissions.get.ts 按角色给权限点 ──▶ permissions.ts      ├ 页面按钮 useHasPermission
        └─ profile.get.ts 按角色给用户信息      └─ hasPermission ◀───┴ AI 能力/指令 filterPageCapabilities
```

- **账号清单只有一份**：`apps/mock/server/utils/mock-accounts.ts`。`login` / `permissions` /
  `profile` 三处都从它反查，**不要再写 `token.includes('super')` 这类子串猜测** ——
  加账号或改角色名时必然漏掉一处。
- **前端权限 store 按应用作用域隔离**：存储键 `admin.permissions:<appId>`，
  切应用由 `registerScopedStore` 触发重新水合，登出/换号由 `resetPermissions()` 清空。
- **权限同步挂在外壳上**（`AppShell` 里的 `useUserPermissions()`），不是挂在 `AppSidebar`：
  只要有一个入口不经过侧边栏（`/sphere`、`_main` 外壳、直接粘贴深链），
  权限 store 就是空的 —— 严格判定下表现为「这页的能力全没了」。

## 2. 唯一判定点：`hasPermission`（`lib/permissions.ts`）

```ts
hasPermission(permissions: readonly string[], pattern: string)   // 经典签名（AI 工具旧调用）
hasPermission(requirement?: PermissionRequirement, context?)     // 增强签名
```

增强签名支持：

| 形态 | 语义 |
|---|---|
| `'table-example:read'` | 单权限点，支持 `*` 通配模块或动作 |
| `['a:read', 'b:read']` | **全部满足**（ALL） |
| `{ any: [...] }` | 任一满足 |
| `{ all: [...] }` | 全部满足 |
| `{ role: 'Admin' }` | 角色匹配（大小写不敏感） |
| `{ custom: (ctx) => boolean }` | 自定义判定 |

未声明要求 = **公开**。不传 `context` 时自动读权限 store。

> 经典签名只在「第一参数是数组且第二参数是字符串」时生效 —— 注意它与增强签名的
> **数组语义不同**（经典是 `some`，增强是 `every`）。新代码统一用增强签名。

## 3. 超管判定（踩过的坑，务必记住）

`computePermissions` 里：

```ts
const normalizedRole = normalizeRoleName(role)   // 'Super-Admin' → 'superadmin'
const isSuperAdmin =
  normalizedRole === 'superadmin' ||
  normalizedRole === 'super' ||
  permissions.includes('*') ||
  permissions.includes('*:*')
```

**`Admin` 不是超管。** 这里曾经写成 `normalizedRole === 'admin'`，后果是：
Mock 的 `Admin`（业务管理员）`isSuperAdmin === true` → `hasPermission` 第一道
`if (context.isSuperAdmin) return true` 直接短路 → **「admin 不能删」整条收敛链失效**。

同一处坑的第二个入口：`filterPageCapabilities` 里曾硬编码
`if (role === 'admin' || role === 'superadmin') return spec` ——
既与 store 的判定分叉（该文件注释自己警告过这条缝），又把业务管理员当超管。
**现已删除，能力过滤只经 `hasPermission` 一处。**

改角色名 / 加角色时，先确认 `roleName` 不会被判定为 `superadmin`。

## 4. React 侧的统一入口：`usePermissionContext()`

侧边栏、外壳导航、命令面板都要「读 store + 拼 context」：

```ts
const permissionContext = usePermissionContext()   // { role, permissions, isSuperAdmin, computed }
```

**不要各自 `usePermissionStore(s => s.role)` 拼三个字段** —— 漏掉 `isSuperAdmin`
就会把超管判成无权。`useHasPermission(req)` 是按钮级用的单点判定。

## 5. 过滤入口（全部复用同一命中器）

`lib/navigation.ts` 里的 `createNavRequirementChecker()` 是导航类过滤的唯一命中实现：

| 入口 | 函数 | 输入 |
|---|---|---|
| 侧边栏 | `filterNavGroups(groups, opts)` | `NAV_GROUPS`（树：组 → 菜单 → 二级项） |
| 命令面板 | `filterNavTargets(targets, opts)` | `ALL_NAV_TARGETS`（扁平） |
| 外壳导航 | `filterShellNavItems(items, opts)` | `MAIN_NAV_ITEMS` / `SETTINGS_NAV_ITEMS` |

### 组级策略：默认 `all`

`NavGroup.groupPermissionMode` 默认 `'all'`：用 `collectGroupFeatureRequirements()`
收集该组**所有层级**的权限点，缺任意一个就**隐藏整个功能组**。
`NavItem.groupPermissionMode` 默认同样是 `'all'`（二级子项全都有才展示该项）。
想宽松就显式写 `'any'`。

> ⚠️ **`'any'` 模式必须用摊平后的权限点判定。** `hasPermission` 对**数组**的语义是
> ALL，所以 `features: ['feature:read', 'dict:read']` 直接丢进去在 any 模式下
> 依然要求两者都有。`flattenPermissionRequirements()` 负责把数组递归摊平，
> `collectGroupFeatureRequirements()` 已经用它 —— 组级、折叠项级两处 `'any'`
> 分支都必须走摊平后的 `some(...)`。

> ✅ **已定口径（2026-09）：容器路由的子模块用 `'any'`。**
> `/system` 是容器路由，其两个子模块（功能 / 数据字典）彼此独立，任一权限就该看到入口 ——
> 因此 `NAV_GROUPS` 里「系统」**组**与「系统」**折叠项**都显式声明
> `groupPermissionMode: 'any'`，与 `routes/$appId/system/route.tsx` 的
> `{ any: ['feature:read', 'dict:read'] }` 守卫一致。
>
> 若保持默认 `'all'`：只有 `dict:read` 的用户能直达 `/system/data-dict`，
> 侧边栏却看不到「系统」组 ——「能进页面却找不到入口」。
> **注意 any 只放宽「入口是否可见」，不放宽任何实际权限**：组内子项仍各自按权限收敛
> （只有 `dict:read` 时「功能」子项照样隐藏）。
>
> 「示例」这类**单一子模块**的组保持默认 `'all'`（all/any 等价，无需显式声明）。

## 6. 路由守卫

```ts
// apps/web/src/lib/app-route-guard.ts
export function guardAppRoute({ appId, href })                    // 认证 + appId 校验
export async function guardRoutePermission({ appId, href, permission, fallbackTo, notify })
```

- **`to` 要的是路由 id，`href` 才是具体路径**。无权限重定向用 `redirect({ href })`：
  曾经写 `to: '/${appId}/home'`（具体路径）会找不到路由。
- 权限从未同步过（`lastUpdated === null`）时先 `ensureUserPermissions()` 拉一次。
- 无权限提示的 i18n **必须显式给命名空间**：
  `i18n.t('unauthorized', { ns: 'auth' })`。写成 `'auth.unauthorized'` 会因为
  `defaultNS` 是 `common` 而命中不到，除中文外 6 种语言全回落中文硬编码（违反铁律 1）。

各模块挂载点（模块根 `route.tsx` 一处，子路由按操作细粒度）：

| 路由 | 权限 |
|---|---|
| `/$appId/example` | `table-example:read` |
| `/$appId/example/user/new` | `table-example:create` |
| `/$appId/example/user/$id/edit` | `table-example:edit` |
| `/$appId/system` | `{ any: ['feature:read', 'dict:read'] }` |
| `/$appId/system/features` | `feature:read` |
| `/$appId/system/features/new` | `feature:create` |
| `/$appId/system/data-dict` | `dict:read` |

## 7. 按钮级收口（现状）

**未声明权限 = 公开**，所以新增操作按钮时要么显式声明，要么明确它是公开的。

已收口：

| 位置 | 权限点 |
|---|---|
| 表格示例：新建 / 批量删除 / 行内编辑+删除 | `table-example:create` / `table-example:delete` / `table-example:edit` |
| 功能树：新建入口、行内编辑+删除、组视图编辑+删除 | `feature:create` / `feature:edit` / `feature:delete` |
| 功能详情：添加权限、权限行内编辑+删除、危险区删除功能 | `feature:create` / `feature:edit` / `feature:delete` |
| **功能详情：表单只读 + 页头开关禁用 + 浮条不出** | `feature:edit` |
| **角色列表：新建 / 行内编辑+删除** | `role:create` / `role:edit` / `role:delete` |
| **角色详情：表单只读 + 菜单授权树禁用 + 浮条不出** | `role:edit` |
| 字典分类表：新增分类、行内新增子分类/编辑/删除 | `dict:create` / `dict:edit` / `dict:delete` |
| 字典项表：新增字典、行内编辑+删除 | `dict:create` / `dict:edit` / `dict:delete` |

约定：

1. 用 `useHasPermission('<module>:<action>')`，**不要**在这里另写 `if (role === ...)`；
2. 行内操作列在「一项操作都没权限」时**整列不渲染**（空菜单比没有菜单更糟）；
3. 危险操作整块（如「危险操作」卡片）不渲染，而不是留一个点了报错的按钮；
4. **只读形态用 `fieldset[disabled]` 包住整片字段区**（见 `FeatureForm` 的 `readOnly`），
   不要逐字段挂 `disabled` —— 加字段时必漏，漏掉的那个就是越权入口。
   页头开关 / 浮条在 `fieldset` 之外，要单独判定。

**尚未收口**：AI 侧写操作的执行前校验（真边界始终在后端）、
`src/features/**` 里 `feature.ts` 声明的页面能力权限点（AI 表单桥目前未声明权限）。

## 7.1 菜单可见性 ≠ 操作权限（两层 RBAC）

Mock 里有**两套互相独立**的授权数据，改动时必须分清自己在动哪一层：

| 层 | 数据 | 决定 | 接口 |
|---|---|---|---|
| **菜单可见性** | `role_menus` 关联表（角色 ↔ 菜单多对多） | 导航里**有没有这一项** | `GET/PUT /role/menus` |
| **操作权限** | `permissions.get.ts` 的 `ALL_PERMISSIONS` 按角色派生 | 进去之后**按钮能不能点** | `GET /permissions` |

身份链是一条线：

```
Authorization token → 账号（apps/mock/server/utils/mock-accounts.ts）
                    → 账号的 role 码 → 角色（db.roles.code）
                    → role_menus 授权 → 菜单树（GET /menus/navigation）
```

Mock 里 `Viewer` 刻意**保留 `role:read` 权限点、却不含「角色管理」的菜单授权** ——
用来演示「有权限点 ≠ 导航里有入口」。副作用是：`Viewer` 直接粘贴 `/system/roles`
能进得去（路由守卫只看权限点），但侧边栏没有入口。这是**刻意保留的差异**，
不是 bug；要让它一致，得让导航也吃菜单授权（见下）。

> ⚠️ 目前前端侧边栏仍由 `NAV_GROUPS` + 权限点过滤驱动，**还没接 `GET /menus/navigation`**。
> 新接口已备好（返回按角色裁剪、带 `path` 的目录/菜单树），下一轮把侧边栏切成树驱动时，
> 过滤口径要从「权限点」换成「菜单授权」——否则两层数据会各说各话。

## 8. AI 侧

- `hasPageCapabilityPermission(permission, authContext?)` —— 页面能力与页面指令
  **共用的唯一判定**，不传 `authContext` 就自动读权限 store。
- `filterPageCapabilities(spec)` —— 给模型的接口 / 表单 / 动作统一在这里裁剪。
- `resolveActivePageCapabilities` 与 `resolveFeatureCommands` **都不传 authContext**，
  直接吃 store（曾经传 authStore 的 `role` + `permissions: undefined`，
  等于把「角色名」和「权限点」拆成两个真值来源）。
- `chat.ts` 发消息前 `ensureUserPermissions()` 拉一次；失败降级为空清单（AI 更保守），
  真正的硬边界始终是**执行时后端按用户身份校验**。

## 9. 自检

没有单测框架，改动后用「执行真实 mock 接口 + 真实判定函数」的 harness 验证
（stub 掉 `react` / `zustand` / phosphor 图标即可直接跑 TS 源码）。至少覆盖：

- `Admin` 的 `isSuperAdmin === false`，且 `feature:delete` / `table-example:delete` / `dict:delete` 均为 `false`；
- `Viewer` 全部 `:read` 为 `true`、`create/edit/delete` 为 `false`；
- 真实 `GET /permissions` 对三个 token 反查出的 role 正确；
- 只拥有 `table-example:read` 时「系统」组整组隐藏。
