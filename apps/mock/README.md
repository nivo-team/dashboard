# @admin/mock — Mock API

替代私有后端的本地假数据服务。**接口定义与 OpenAPI 契约同源**：
每个路由用 `defineRouteMeta` 声明自己的契约，Nitro 构建时反向生成 `/openapi.json`，
契约再被前端用来生成 SDK。因此接口改动只需要改这一处。

## 快速开始

```bash
pnpm mock          # 在仓库根执行，启动 http://localhost:3001
```

浏览器打开 <http://localhost:3001> 是状态页，<http://localhost:3001/openapi.json> 是生成的契约。
登录时**任意非空账号 + 任意非空密码**都能进入。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/login` | 登录（任意非空账号密码通过） |
| GET | `/profile` | 当前用户信息 |
| GET | `/apps` | 可选应用列表（每个应用带自己的 `apiBaseUrl`） |
| GET | `/api` | 系统接口清单（功能管理关联接口权限用） |
| GET | `/user` | 用户分页列表（支持 `kw` 搜索） |
| GET | `/system/menu/tree` | 功能菜单树 |
| POST / PUT | `/system/menu` | 新建 / 更新功能 |
| DELETE | `/system/menu/{id}` | 删除功能（连同下级） |
| GET | `/data_dict` | 字典项分页列表（`type_id` / `kw` / `status`） |
| POST / PUT | `/data_dict` | 新建 / 更新字典项 |
| DELETE | `/data_dict/{id}` | 删除字典项 |
| GET | `/data_dict/options` | 全量字典选项（按分类编码分组） |
| GET | `/data_dict/type/tree` | 字典分类树 |
| POST / PUT | `/data_dict/type` | 新建 / 更新字典分类 |
| DELETE | `/data_dict/type/{id}` | 删除分类（有子分类或字典项时拒绝） |

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
    system/menu/…            # tree.get.ts / index.post.ts / index.put.ts / [id].delete.ts
    data_dict/…
  utils/
    db.ts                    # 内存数据与树构建
    response.ts              # 统一 { code, message, result } 包装
    query.ts                 # 分页与查询参数解析
```

## 两个约定

- **响应统一是 `{ code, message, result }`**：`code === 0` 表示成功，
  非 0 表示业务错误（HTTP 状态码仍是 200）—— 前端的响应拦截器依赖这一点。
- **`defineRouteMeta` 只接受字面量**：它是构建期宏，不能调用函数生成 schema。
  需要复用时，用同一份 `$global.components.schemas` 声明具名 schema，其它路由 `$ref` 它。
