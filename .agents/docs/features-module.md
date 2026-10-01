# 菜单管理 / 角色管理模块

> 面向「接手继续开发」的现状说明：读完这篇不必再翻会话历史。
> 业务代码：菜单管理在 `apps/web/src/features/system/menus/`（薄路由 `.../routes/$appId/system/menus/`），
> 角色管理在 `apps/web/src/features/system/roles/`（薄路由 `.../routes/$appId/system/roles/`）。
> 仓库级规范见 [AGENTS.md](../AGENTS.md) 与 skill `table-development` / `editable-detail`。
> 最后更新：2026-10（**模块已从「功能（Features）」更名为「菜单管理」**）。

## 0. 术语变更（2026-10）——先读这一段

| 旧称 | 现在叫 | 代码标识 |
| --- | --- | --- |
| 功能组（`menu_type=1`） | **目录** | `MENU_TYPE.directory` |
| 功能（`menu_type=2`） | **菜单** | `MENU_TYPE.menu` |
| 权限（`menu_type=3`） | **操作**（权限点） | `MENU_TYPE.action` |
| ——（新增概念） | **路由地址 `path`** | 目录 / 菜单**必填**，操作留空 |

**改名的边界（重要，别改错方向）**：

- **已改**：UI 文案（「菜单管理」）、路由 `/system/menus`、代码目录 `features → menus`、
  i18n 命名空间 `messages/menus`、导航键 `nav.systemMenus`；
- **故意未改**：权限点仍是 `feature:*`（判定体系刚理顺，不动它）；
  模块内的**文件与组件名**仍是 `feature-*`（`FeatureForm` / `useFeatureColumns`）——
  `feature` 在此模块内是「菜单项」的代码术语，与权限点 `feature:*` 保持一致；
  数据层继续沿用后端 `menus` 命名（`getSystemMenuTree`、`postSystemMenu`、`MENU_TYPE`），
  **不要跟着重命名生成产物**。
- 旧路径 `/$appId/system/features` **已不存在**，不要再引用或复活。

> 本文下面出现的「功能组 / 功能 / 权限」都是**改名前的旧称**，按上表对应理解即可。

---

## 1. 路由与视图分流

| 路径 | 视图 |
| --- | --- |
| `/$appId/system/menus` | 根容器视图：渲染 `MENU_ROOT_ID`（482）的直接子项 |
| `/$appId/system/menus/$featureId` | **同路由按 `menu_type` 分流**：目录 → 容器视图（继续下钻）；菜单 / 操作 → 详情视图 |
| `/$appId/system/menus/new?pid=<父id>&type=group\|button` | 创建表单（`type=group` → 目录、`type=button` → 操作、缺省 → 菜单） |
| `/$appId/system/roles` | 角色列表（分页 + 关键词 + 新建 / 编辑 / 删除） |
| `/$appId/system/roles/$roleId` | 角色详情：基本信息表单 + **菜单授权树**，改动经底部浮条统一保存 |

`menu_type` 的语义：

| 值 | 含义 | 有详情页 | 路由地址 `path` | 表单字段差异 |
| --- | --- | --- | --- | --- |
| 1 | 目录 | 否，落在容器视图 | **必填**（该目录的落地路由，如 `/system`） | 无权限标识、无绑定接口 |
| 2 | 菜单 | 是（表单 + 操作表） | **必填**（页面路由，如 `/system/menus`） | 全字段 |
| 3 | 操作（权限点） | 是（弹窗增删改） | 留空（按钮级权限点没有落点） | 无「显示」开关 |

## 2. 数据源：全模块只有一棵树

- **迁移状态**：模块已按 **TanStack Query** 方式接入，是本仓库**首个带写操作的模块**。
- 只发一个请求：`GET /system/menu/tree?menu_id=MENU_ROOT_ID`（**恒定带 482**，不裸调 tree，否则会带出旧系统整棵历史菜单树）。
- **接口语义（已实测）**：返回的是**该 id 的直接子节点数组、不含该 id 自身**，后代嵌在各自 `children` 里；整棵新架构功能树约 1.2KB。
  - 曾经有个错误实现 `resolveMenuSubtree` 把 `result[0]` 当「自身」（与真实语义恰好相反），随本次重构一并删除 —— 不要复活这种位置约定。
- 容器 / 详情 / 表单初始值 / 页面内面包屑全部由这棵树在本地派生：`useFeaturesTree()` + `findMenuPath()` + `menuChildren()`。
- 写操作成功后统一 `useInvalidateFeaturesTree()`（按 `getSystemMenuTreeQueryKey()` 前缀失效整个模块的缓存）。
- 写操作：`POST` / `PUT` / `DELETE /system/menu`（`postSystemMenuMutation` / `putSystemMenuMutation` / `deleteSystemMenuByIdMutation`）。
- 仓库其余页面仍是直接调用 SDK 的写法，可逐步迁移，不必一次性重写。

## 3. 目录结构

```
apps/web/src/features/system/features/       # 业务代码（一个业务一个文件夹，扁平）
├── list/index.tsx             # /features 根容器视图（导出 FeaturesRootPage）
├── list/feature.ts            # ★ 对 AI 的声明：这一层的功能数据源（来自容器上报）
├── node/index.tsx             # 按 menu_type 分流的节点视图（导出 FeatureNodePage，featureId 走 props）
├── node/feature.ts            # ★ 当前节点数据源（节点 + 下级）
├── create/index.tsx           # 创建表单（pid / type 由薄路由解析后传入）
├── create/feature.ts          # ★ 新建上下文（pid / 类型）+ 表单声明
├── feature-container.tsx      # 容器视图：搜索 + 分页 + 表格 + 分裂按钮 + 功能组自身的编辑/删除
├── feature-detail.tsx         # 详情视图：左侧表单 + 权限表，右侧 sticky 信息卡片
├── feature-form.tsx           # 共用表单（group / feature / button 三种字段集）
├── feature-form-dialog.tsx    # 表单的弹窗封装（FeatureFormDialog）
├── feature-permission-delete-dialog.tsx  # 权限的轻量删除确认
├── feature-create-actions.tsx # 容器视图的分裂创建按钮（ButtonGroup）
├── feature-api-keys-field.tsx # 「绑定接口」多选（Kumo Combobox）
├── feature-options.ts         # 枚举、树工具、固定 id（见第 4 节）
├── feature-columns.tsx        # 列表列与子表列编排 + 渲染器
├── feature-apis.ts            # GET /api 接口清单（useApiItems / useApiKeyLabel）
├── feature-breadcrumb.ts      # 把层级注册给顶栏面包屑
├── use-features-tree.ts       # 单一数据源 hook + 缓存失效
└── demo-features.ts           # 接口不可用时的演示兜底数据

apps/web/src/routes/$appId/system/features/
├── route.tsx                  # 模块根（Outlet）
├── index.tsx / $featureId.tsx / new.tsx   # 薄适配（+ beforeLoad 的 482 重定向、validateSearch）
```

**对 AI 的声明**（`useFeature`，一页一次）：
- 根视图 / 节点视图：数据源 `feature-tree` / `feature-node`（这一层的功能与下级、菜单 id、权限标识、路由名…）。
  根视图的数据由 `FeatureContainer` 通过 `onData` 上报（"这一层有哪些行"的推导只在那边有一份）；
- 新建页：数据源 `create-context`（这次新建挂在谁下面、是哪一类节点）；
- **功能详情的表单桥早已接好**（`feature-form.tsx` 的 `useAiFormFields` + 详情页 `useAiFormSubmit`，id = `feature-detail`）——
  AI 可 `fill_form` / `submit_form`（`canSubmit` 复用 `isDirty`）；**新建页的表单桥还没接**（下一步）；
- **没有 `commands`**：增删入口的弹窗状态在 `feature-container.tsx` / `feature-detail.tsx` 内部，页面拿不到句柄
  （补齐方式见 [features-architecture.md](./features-architecture.md) §7）。

## 4. 固定 id 与临时值（将来可能删）

当前有若干「环境相关」的写死值。它们**现在都必须保留**，但都有明确的删除条件，并且注释里统一打了 `⏳` 标记 ——

> **清理入口：全局搜索 `⏳`** 即可一次找齐所有临时值与删除条件。

| 值 | 位置 | 来源 | 现在为什么留着 | 删除条件 |
| --- | --- | --- | --- | --- |
| `MENU_ROOT_ID = 482` | `apps/web/src/features/system/features/feature-options.ts` | 测试环境实测：后端为新架构单独建的根节点 `new-adm` | 所有请求靠它把范围限定在新架构内 | 后端提供「当前应用的功能根」查询或由 App 配置下发根 id |
| `MENU_PLACEHOLDER_COMPONENT = '/ignore'` | 同上 | 真实节点的 `component` 也是 `/ignore` | 后端 `SysMenuCreateReq/UpdateReq` 仍校验「组件[Component]不能为空」 | 后端放开该字段必填校验 |
| `MENU_PLACEHOLDER_PATH = '/ignore'` | 同上 | 同上 | 同上（「路由地址[Path]不能为空」） | 同上 |
| 演示数据里的 `482 / 484 / 483 / 485` | `apps/web/src/features/system/features/demo-features.ts` | 测试环境**真实存在**的 id，不是编的 | 接口不可用时仍可预览/联调（页面显示「演示数据模式」） | 接口稳定后删除整个文件 + `use-features-tree.ts` 的兜底分支 + 各页面 `demoBadge` |
| 「只渲染前 50 条」 | `apps/web/src/features/system/features/feature-api-keys-field.tsx` | 按接口清单 632 条的量级定的 | 避免 632 条一次性进 DOM | 接口量级大幅变化时重新评估 |

## 5. 可复用的约定（做新模块直接照搬）

| 场景 | 做法 |
| --- | --- |
| 编辑态保存 | 表单不出保存按钮，用 `#/components/unsaved-changes-bar`（底部浮条：未保存提示 + 重置/保存）；页面只需维护草稿、`dirty`（`normalizeDraft()` 规范化比较）与 `resetSeq`（递增即重建表单回到初值）。详情页表单用 `variant="feature"` + `heading="基本信息"` + `showActions={false}`；「启用」开关交给页头右侧（`status` 受控 + `showStatusSwitch={false}`）。完整契约见 skill `editable-detail` |
| 简洁表格（详情页子表） | `DataTable` 的 `headerTitle`（头部标题）/ `footer`（统计挪到卡片尾部）/ `headerActions`（头部右侧操作），**不要**为了一两个按钮挂整条 `TableControls` |
| 不可逆操作 | `#/components/danger-confirm-dialog`：必须**原样输入资源名**才能点亮确认按钮；目标名用 `#/components/copyable-value` 展示并提供一键复制 |
| 弹窗表单 | `FeatureFormDialog`（`variant` 决定字段集，标题/描述/提交文案由调用方给；`LayerDialog.Actions.Primary` 用 HTML `form` 属性提交，`formId` 需页面内唯一） |
| 表单字段说明 | 一律用 Kumo `Input` 自带的 Field 外壳（`label` / `error` 直接传给 `Input`，`Combobox` 同理）；字段说明统一放 `labelTooltip`（label 右侧 info 图标），不要用 `description` 在输入框下方占一行；校验错误仍走 `error`。**不要把裸 `Input` 套在外层 `Field` 里** —— Kumo `Field` 不会把 label 关联到控件，开发环境会报 `[Kumo Input]: Input must have an accessible name` |
| 开关类字段 | 「启用/显示」并排一行（`flex flex-wrap items-center gap-x-6`），**文案随状态**：启用\|禁用、显示\|隐藏（键为 `form.statusEnabled` / `form.statusDisabled` / `form.visibleShown` / `form.visibleHidden`），不要只写死一个动作词 |
| 顶栏面包屑 | 用 `#/lib/breadcrumb-trail` 注册「路径 → { 名称, 父级路径 }」，AppHeader 会把扁平动态段还原成可点的层级链 |
| 全局错误提示 | API 响应拦截器已统一处理：HTTP 200 但 `code !== 0` → 弹错误 toast 并抛 `ApiError`；业务错误不重试。业务代码直接 `catch` 用 `extractApiErrorMessage()` 取文案即可 |
| RTL 注意点 | `DropdownMenu.Item` 不要用 `icon` 属性（Kumo 内部写死 `mr-2`），改 children + `gap-2`；`ButtonGroup` 分裂按钮两端圆角用 `first/last-of-type` 显式钉住；Kumo `InputGroup` 的拼接用物理方向类，必要时锁 `dir` |

## 6. 已知待办

- **数据字典模块已实现**（`apps/web/src/routes/$appId/system/data-dict/`，现状见 [data-dict-module.md](./data-dict-module.md)）：上面的约定（弹窗表单、危险确认、面包屑注册、错误处理、RTL 注意点）都被它直接复用；注意它的数据源是「全量分类树 + 服务端分页字典项」两个，列表走服务端分页，没有照搬本模块的「单棵树本地派生」。它还有一处特殊之处：两个接口的 openapi 响应 schema 是错的，响应类型与运行时 schema 由模块自声明（搜 `⏳`）。
- i18n：`features` 命名空间**当前只有中文**，其余 6 种语言回退 `zh-CN`，待测试通过后补齐。
- RTL：尚未按 `ar-SA` 逐项巡检（列表、下钻、详情表单、三个弹窗、下拉、权限表、sticky）。
- `apps/web/src/features/users/user/list/index.tsx` 有 3 处 `DropdownMenu.Item icon=`，RTL 下间距不镜像。
- `apps/web/src/messages/system/*`（7 个语言文件）在本模块迁移后**已无任何引用**，确认后可删。
- 后端放开 `component` / `path` 校验后，清理两个占位常量；接口稳定后删除演示兜底数据。
- 浏览器端交互（sticky 吸顶、浮条、弹窗、RTL）尚未人工逐项验收；`pnpm build` / `pnpm dev` 可用（若报 `@rolldown/binding-darwin-universal` 缺失，换系统 node 即可，与代码无关）。

## 7. 容器视图（功能组）

- 创建入口是**分裂按钮**（添加功能 / 添加功能组）：`menu_type` 由 URL 的 `type` 决定（`group` → 1 功能组，缺省 → 2 功能），`parent_id` 取自 `pid`，成功后按 `pid` 原路返回。
- 功能组**自身**的写操作入口在页头右侧：**编辑**用 `secondary` 变体按钮 + `LayerDialog` + 复用 `FeatureForm variant="group"`；**删除**用 `destructive` 变体按钮 —— 有子项只 toast 提示，无子项才走 `DangerConfirmDialog`（需输入组名确认），成功后回上一级。**根视图 482 自身不在接口返回的树里**，因此根视图不提供这两个操作。
- 表格行末只有「编辑 + 删除」两项：编辑**只保留一个入口**（功能组显示「编辑功能组」、功能显示「编辑功能」），点击即进入对应视图完成编辑，不额外弹窗；删除走通用 `DangerConfirmDialog`（**必须输入名称**），并复刻页头那层**有子项直接 toast 提示**的前置拦截（`detail.deleteBlocked`），成功后失效整棵树但**留在当前页**（被删的不是当前容器）。
- **列表是树表**（`tree`）：层级缩进与展开控件固定在第一列；功能组可展开出下级，功能 / 权限没有下级，自然不出现展开控件。
- 搜索是**本地过滤**（接口没有关键词参数）：**只保留命中节点 + 其祖先链**，按行 id 展开到命中项，清空关键词回落折叠。过滤与展开统一走通用能力 —— 过滤用 `#/lib/tree-search` 的 `filterTreeByMatch`、展开用 `#/components/data-table` 的 `useTreeSearchExpanded`，与数据字典分类树共用（详见 skill `table-development` 第 2.4 节）。
- 删除规则（功能 / 功能组）：**有 `children` 的节点不允许删除** —— 点按钮直接 toast 提示「请先删除子项」（`detail.deleteBlocked`），**不弹窗、不等后端报错**；无子项时用通用 `DangerConfirmDialog` 二次确认，要求**输入名称**才能确认（`detail.deleteFeatureConfirm` / `detail.deleteGroupConfirm` 用 `<Trans>` 把名称加粗）。
- 权限（3）不会出现在容器视图（权限挂在功能下），它的删除在功能详情页的权限子表里、用更轻的 `LayerDialog.Alert`。

## 8. 功能详情视图

- 布局参照 Clerk 的 feature 详情页：左列（`lg:col-span-2`，内部 `flex flex-col gap-4`）自上而下是**功能自身的可编辑表单**（复用 `FeatureForm variant="feature"`，标题覆盖为「基本信息」，提交走 `PUT`）与**权限列表**。
- 右侧整列只放信息卡片，是 `lg:sticky lg:top-20` + `self-start` 的侧栏，**每块内容各自一个 `LayerCard`**（Key 用 `ClipboardText` 一键复制 / 详细信息 / 危险操作删除功能）。**注意 sticky 必须配合 `self-start` / `items-start`**，否则 grid item 被拉伸后吸顶失效。
- 移动端（单列）用 `order-1` / `order-2` 把右侧信息卡片提到表单**之前**（先看信息再改表单），桌面端用 `lg:order-*` 还原左右顺序。
- **编辑态**：详情页内嵌可编辑表单（`FeatureForm variant="feature"` + `heading="基本信息"` + `showActions={false}`，不出自带按钮），保存 / 重置由底部通用浮条 `#/components/unsaved-changes-bar`（`UnsavedChangesBar`）承担；「启用」开关交给页头右侧（`status` 受控 + `showStatusSwitch={false}`）。**完整契约、骨架代码、接入清单与常见坑见 skill `editable-detail`** —— 数据字典分类详情已按同一套实现。

## 9. 权限子表（`menu_type = 3`）

- 权限的增删改都在页内弹窗完成；权限表是**「简洁表格」**（不挂 `TableControls` / 列设置）：卡片头部左侧只有标题「权限」（与统计同色，仅 `font-medium` 区分层级）、右侧是 `DataTable.headerActions` 里的 **`ghost` 变体**「添加权限」按钮，统计（共 N 项）通过 `DataTable.footer` 放到卡片尾部。
- 列只保留**名称 / 权限标识 / 排序 / 状态 / 绑定接口** —— `menu_type` 与 `visible` 对权限没有信息量，已从 `FEATURE_CHILD_COLUMN_SPECS` 去掉；表格最后一列是 actions（编辑 / 删除）。
- 新建与编辑共用通用弹窗 `apps/web/src/features/system/features/feature-form-dialog.tsx`（`FeatureFormDialog`：`variant` 决定字段显隐，标题 / 描述 / 提交按钮文案由调用方给，`LayerDialog.Actions.Primary` 用 HTML `form` 属性提交、因此表单在 `LayerDialog.Body` 内、`formId` 需页面内唯一）。
- **编辑时显式回传原 `parent_id`**，避免后端把缺失的上级当成根层级。
- 删除走轻量的 `LayerDialog.Alert` 确认（见 `apps/web/src/features/system/features/feature-permission-delete-dialog.tsx`：叶子节点、风险低，**不要求输入名称**）。
- **权限没有「是否显示」概念**：表单不出 `visible` 开关，请求也不带该字段（编辑时不传即保持后端原值）。

## 10. 接口清单与「绑定接口」多选

- **数据源 `GET /api`**：baseUrl 已含 `/api`，所以浏览器里实际是 `/api/api`。**该接口在 `openapi.json` 里是存在的**（response 为 `v1.ApiItem[]`，字段 `label / method / path / value`），SDK 已有 `getApi` / `getApiQueryOptions`，**不要手工补生成产物**。实测返回约 **632 条**；`api_keys` 存的就是其中的 `value`（md5），例如 `30cd4f597a030a1b9bad8ca9e571f7ef` → `GET:/api/system/menu/tree`。
- 封装在 `apps/web/src/features/system/features/feature-apis.ts`（`useApiItems` / `useApiKeyLabel`，30 分钟 `staleTime`、跨组件共享缓存）；列表 / 详情展示时同样把 md5 还原成可读 label。
- 表单里作为「绑定接口」候选：`FeatureApiKeysField`（`apps/web/src/features/system/features/feature-api-keys-field.tsx`）用 Kumo `Combobox` 的 **`multiple` + `TriggerMultipleWithInput` + `Chip`** 形态（框内 chip、浮层候选不推挤表单、方向键 / Enter / Esc 键盘可达、`limit=50` 限制单次渲染）。
- Combobox 的 value 需要是可显示字符串，所以组件内部在 **label 与 md5 之间双向映射**，并**按 id（`value` / md5）把已选项从候选里过滤掉** —— 已绑定只以 chip 显示，下拉不再重复出现；清单外的历史值同样只出现在 chip 上，保证回显不丢。
- chip 渲染走的是受控 `value`（不依赖 `items`），且 chip 与选中值的关联依赖渲染顺序，**必须按 `value` 顺序渲染 chip**。


## 11. 相关文档

- [AGENTS.md](../AGENTS.md) 第 6 节「迁移状态」：模块的详细实现约定
- skill `.agents/skills/table-development/SKILL.md`：表格（含「简洁表格」例外）规范
- [路由与布局架构](./routing-architecture.md)：模块目录化约定
- [UI 与样式设计规范](./ui-and-styling.md)：Kumo 语义令牌与设计准则

---

## 12. 角色管理（2026-10 新增）

模块：`apps/web/src/features/system/roles/`（列表 `list/`、详情 `detail/`），路由 `.../system/roles`。
权限点 `role:read / create / edit / delete`（已加进 mock 权限清单与 `GET /api` 白名单）。

数据模型（mock，`apps/mock/server/utils/db.ts`）：

- `RoleRow`：`id / name / code / description / status / sort / created_at / updated_at`；
- `RoleMenuRow`：**独立的关联表** `role_menus`（`role_id` + `menu_id` 多对多）——
  菜单授权不是角色上的一个数组字段，`PUT /role/menus` 是**全量覆盖**语义；
- 身份链：`token → 账号 → 账号的 role 码 → 角色 → role_menus → 菜单树`
  （见 `apps/mock/server/routes/menus/navigation.get.ts`）。

mock 里强制的两条硬约束：

1. **内置角色（`code` ∈ `super` / `editor` / `viewer`）不可删、`code` 不可改** ——
   它们是三个测试账号的登录身份，改掉导航就空了；
2. 删除角色时**连带清理 `role_menus`**，不留孤儿授权。

两条交互约定：

- 详情页把「基本信息」与「菜单授权」放进**同一个底部浮条**保存：表单走 `PUT /role`、
  授权走 `PUT /role/menus`，任一脏了浮条就出现；表单校验仍只在 `validateRoleForm` 一处
  （浮条保存不经过 `<form>` 的 submit，见 skill `editable-detail` 坑 1）；
- 授权树 `MenuTreeSelection`（`role-menu-tree.tsx`）是**扁平渲染 + 缩进**（不是嵌套 DOM），
  勾选子项会**自动补齐祖先** —— 父节点没被授权时，后端 `visibleMenuTree` 不会返回它的子节点。

> ⚠️ 导航目前仍由 `NAV_GROUPS` + 权限点过滤驱动，**还没接 `GET /menus/navigation`**。
> 新接口已备好（按角色裁剪、节点带 `path`）；下一轮把侧边栏切成树驱动时，
> 过滤口径要从「权限点」换成「菜单授权」，否则两层数据会各说各话
> （见 [permissions-architecture.md](./permissions-architecture.md) §7.1）。
