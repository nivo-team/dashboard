# @admin/mock — Mock API

替代私有后端的本地假数据服务。**接口定义与 OpenAPI 契约同源**：
每个路由用 `defineRouteMeta` 声明自己的契约，Nitro 构建时反向生成 `/openapi.json`，
契约再被前端用来生成 SDK。因此接口改动只需要改这一处。

## 快速开始

```bash
pnpm mock          # 在仓库根执行，启动 http://localhost:3001
```

浏览器打开 <http://localhost:3001> 是状态页，<http://localhost:3001/openapi.json> 是生成的契约。

登录只认三个预设测试账号（密码统一 `123`）—— 刻意收紧，为的是让「角色 → 权限 → 界面收敛」
这条链可验证；账号真值表在 [`server/utils/mock-accounts.ts`](./server/utils/mock-accounts.ts)：

| 账号 | 角色 | 能力 |
| --- | --- | --- |
| `super admin` | Super Admin | 全量读写删改 |
| `admin` | Admin | 能建能改，**不能删**（无 `:delete`） |
| `user` | Viewer | 只读 |

> 登录成功后 mock 会按账号签发对应 token（`mock-token-super` / `mock-token-admin` /
> `mock-token-user`），`GET /permissions` 与 `GET /profile` 都**按 token 反查**该账号 ——
> 不再用 `token.includes('super')` 这类子串猜测。
>
> **`Admin` 不是超管**：前端的超管判定只认 `Super Admin`（见
> [permissions-architecture.md](../../.agents/docs/permissions-architecture.md)）。
> 把 `Admin` 当超管的后果是「admin 不能删」在判定第一道就被短路掉。

### 局域网访问

dev server 监听所有网卡（`nitro.config.ts` 的 `devServer.hostname = '0.0.0.0'`，端口 3001 同处声明），
局域网内其它设备用 `http://<本机 IP>:3001` 打开状态页 / 契约 / 接口都一致可用。

多应用模式（`VITE_MULTI_APP=true`）下 `/apps` 下发的地址取自 `MOCK_PUBLIC_URL`，
不配时是 `http://localhost:3001`（别的设备拿到会把请求打回它自己）。局域网开发时写进
`apps/mock/.env`（已被 git 忽略，Nitro dev 自动加载 `.env` / `.env.local`）：

```bash
MOCK_PUBLIC_URL=http://<本机 IP>:3001
```

前端一侧只需覆盖 `apps/web/.env.development.local`，三处地址的对应关系见
[apps/web/.env.example](../web/.env.example) 的「局域网访问」一节。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/login` | 登录（仅三个预设测试账号，密码 `123`） |
| GET | `/profile` | 当前用户信息（按 token 反查账号） |
| GET | `/permissions` | 当前用户的权限点清单（按 token 反查角色；`?role=` 可覆盖，仅供调试） |
| GET | `/apps` | 可选应用列表（每个应用带自己的 `apiBaseUrl`） |
| GET | `/api` | 系统接口清单（菜单管理关联接口权限用，**同时是 AI 写操作白名单**） |
| GET | `/user` | 用户分页列表（支持 `kw` 搜索） |
| POST / PUT | `/user` | 新建 / 更新用户 |
| DELETE | `/user/{id}` | 删除单个用户 |
| POST | `/user/batch-delete` | 批量删除用户（body `{ ids }`） |
| GET | `/ticket` | 工单分页列表（`kw` / `status` / `priority` / `category` / `assignee`） |
| GET | `/ticket/{id}` | 工单详情 |
| POST / PUT | `/ticket` | 新建 / 更新**单条**工单（PUT 的 body 带 `id`） |
| DELETE | `/ticket/{id}` | 删除**单条**工单 |
| PATCH | `/ticket/{id}/status` | 变更**单条**工单状态（body `{ status }`） |
| GET | `/menus/navigation` | **导航菜单树**：按当前用户角色裁剪，只含目录(1)/菜单(2)，每个节点带 `path` 路由地址 |
| GET | `/system/menu/tree` | 菜单树（**配置视角**：全量、含操作节点，菜单管理页用） |
| POST / PUT | `/system/menu` | 新建 / 更新菜单 |
| DELETE | `/system/menu/{id}` | 删除菜单（连同下级） |
| GET | `/role` | 角色分页列表（`kw` / `status`） |
| GET | `/role/{id}` | 角色详情 |
| POST / PUT | `/role` | 新建 / 更新角色（内置角色不可改 code、不可删） |
| DELETE | `/role/{id}` | 删除角色（连同它的菜单授权） |
| GET | `/role/menus` | 查询某角色已授权的菜单 ID（`?role_id=`） |
| PUT | `/role/menus` | 替换角色的菜单授权（**全量覆盖**，body `{ role_id, menu_ids }`） |
| GET | `/data_dict` | 字典项分页列表（`type_id` / `kw` / `status`） |
| POST / PUT | `/data_dict` | 新建 / 更新字典项 |
| DELETE | `/data_dict/{id}` | 删除字典项 |
| GET | `/data_dict/options` | 全量字典选项（按分类编码分组） |
| GET | `/data_dict/type/tree` | 字典分类树 |
| POST / PUT | `/data_dict/type` | 新建 / 更新字典分类 |
| DELETE | `/data_dict/type/{id}` | 删除分类（有子分类或字典项时拒绝） |

### 工单模块：**刻意没有批量接口**

`/ticket` 这一族**只提供单条接口**（对比 `/user` 有 `batch-delete`）——
它是「后端只给单条增删改时，AI 怎么批量操作」的验收场：
正确的做法是 AI 用 `manage_tasks` 把 N 次单条调用**编排**成一份计划、由客户端顺序执行，
而不是循环调用单条接口（那样每一条都要一次模型往返）。

所以**不要**给 `/ticket` 补批量端点 —— 那会让这个示例失去意义。
它对应前端 `/$appId/example/tickets`（见 [features-architecture.md](../../.agents/docs/features-architecture.md)）。

> **`GET /api` 的清单必须与真实接口对齐**：它不只是"功能管理里的 API Keys 选项"，
> 同时是 **AI 写操作的白名单**（`call_write_api` 按它校验 method + 路径模板）。
> 页面能力（`usePageCapabilities`）里声明了某个接口、而这份清单里没有它，AI 就**完全动不了**
> 那个模块 —— 用户模块的删除曾经就是这样：接口在、页面按钮也能删，但 AI 一调就被判"不在清单里"。
> 所以**新增接口时顺手补 `server/routes/api.ts`**（带路径参数写成 `/user/{id}` 模板）。

## 菜单树与角色

菜单是**三层树**（`server/utils/db.ts` 的 `MenuRow`）：

| `menu_type` | 名称 | 有路由地址？ | 说明 |
| --- | --- | --- | --- |
| `1` | 目录 | **有**（`path`） | 分层容器，它的 `path` 是该目录的落地路由（如 `/system`） |
| `2` | 菜单 | **有**（`path`） | 具体页面，`path` 指定打开它落到哪个前端路由（如 `/system/menus`） |
| `3` | 操作 | 无（空串） | 按钮级权限点，只承载 `permission`（如 `feature:read`） |

`path` 是**相对 appId** 的路径，前端拼成 `/${appId}${path}` 跳转。种子里这棵树与前端真实路由逐一对齐；
`permission` 必须与 `GET /permissions` 的权限点**逐字一致**（是 `:read` 而不是旧数据的 `:view`）。

角色是独立的实体（`RoleRow`），与菜单通过**关联表** `role_menus` 建立多对多：

```
登录 token → 账号（utils/mock-accounts.ts）→ 账号的 role 码 → 角色 → role_menus → 菜单树
```

- **菜单可见性**（`role_menus`）：决定导航里有没有这一项；
- **操作权限**（`permissions.get.ts` 的 `ALL_PERMISSIONS`）：决定进去之后按钮能不能点。

两层刻意分开：Mock 里 `Viewer` 仍有 `role:read` 权限点，但它的菜单授权里没有「角色管理」——
用来演示「有权限点 ≠ 导航里有入口」。

两个菜单接口的分工：

- `GET /system/menu/tree` —— **配置视角**：管理员维护菜单时看的全量树（含操作节点）；
- `GET /menus/navigation` —— **使用视角**：当前用户能看到的导航树（按角色裁剪，已剔除操作节点）。

## 数据是内存态

全部数据在 `server/utils/db.ts` 里的模块级变量中：**写操作真实生效**
（新增后列表立刻能看到，删除后确实消失），但只活在进程内，**重启即回到初始状态**。

这正是 Mock 需要的语义 —— 不用维护数据库，又能把后台的增删改查流程完整走通。

部分校验刻意与真实后端保持一致，方便前端把错误分支也调通：

- 字典项：同一分类下键值不可重复；设置默认项会把同分类其它项降级；
- 字典分类：编码只允许小写字母/数字/连字符；有子分类或字典项时不允许删除；
- 功能菜单：上级不能是自己；删除父节点会连同整棵子树一起删除。

## 部署

产物是标准 Nitro 输出，本地预览与两种平台都支持：

```bash
pnpm -C apps/mock build              # Node 产物，本地预览：pnpm -C apps/mock preview
pnpm -C apps/mock build:cloudflare   # Cloudflare Workers
pnpm -C apps/mock build:vercel       # Vercel
```

**Cloudflare**：构建后 Nitro 会生成完整的 `.output/server/wrangler.json`
（`main` 与 `assets` 由它写入，所以 `wrangler.jsonc` 里只写 `name` /
`compatibility_flags` 这些它不生成的部分），直接部署：

```bash
pnpm -C apps/mock deploy             # 等价于 npx nitro deploy --prebuilt
```

**Vercel**：产物在 `.vercel/output`，用 `npx vercel deploy --prebuilt`。

## 自检

改完 mock 后跑一次冒烟测试，覆盖全部接口与写操作闭环：

```bash
node apps/mock/scripts/smoke.mjs            # 默认 http://localhost:3001
```

## 目录

```
server/
  routes/
    login.post.ts            # 一个文件一个接口，文件名即路径与方法
    apps.get.ts
    user.get.ts
    menus/navigation.get.ts  # 导航菜单树（按角色裁剪；注意是 /menus 不是 /system/menu）
    system/menu/…            # tree.get.ts / index.post.ts / index.put.ts / [id].delete.ts
    role/…                   # index.get.post.put.ts / [id].get.delete.ts / menus.get.put.ts
    data_dict/…
  utils/
    db.ts                    # 内存数据、菜单树、角色与 role_menus 关联表
    mock-accounts.ts         # 测试账号真值表（login / permissions / profile / navigation 共用）
    response.ts              # 统一 { code, message, result } 包装
    query.ts                 # 分页与查询参数解析
```

## 两个约定

- **响应统一是 `{ code, message, result }`**：`code === 0` 表示成功，
  非 0 表示业务错误（HTTP 状态码仍是 200）—— 前端的响应拦截器依赖这一点。
- **`defineRouteMeta` 只接受字面量**：它是构建期宏，不能调用函数生成 schema。
  需要复用时，用同一份 `$global.components.schemas` 声明具名 schema，其它路由 `$ref` 它。
