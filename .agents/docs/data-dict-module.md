# 数据字典（Data Dictionary）模块

> 状态：**已实现**（2026-09-25 首次落地）。代码位于 `apps/web/src/routes/$appId/system/data-dict/`。
> 本文第 1–3 节是可复现的接口事实，第 4 节起是**实现后的现状说明**（含第 6 节待确认项的结论与依据）。
> 开发方式与可复用约定参考 [功能（Features）模块](./features-module.md)，仓库级规范见 [AGENTS.md](../AGENTS.md) 第 6 节与 skill `table-development`。

数据字典的形态：**分类（type，可嵌套 = 目录）→ 字典项（item，挂在分类下的键值对）**。

---

## 1. 接口清单（10 个，实测量级已标注）

### 分类（type）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/data_dict/type/tree` | 分类树，**无任何参数**（一次返回整棵） |
| POST | `/data_dict/type` | 新建分类（`v1.DataTypeCreateReq`） |
| PUT | `/data_dict/type` | 更新分类（`v1.DataTypeUpdateReq`） |
| DELETE | `/data_dict/type/{id}` | 删除分类 |

### 字典项（item）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/data_dict` | 列表，**服务端分页**：`kw` / `page` / `page_size` / `status` / `type_id` |
| POST | `/data_dict` | 新建项（`v1.DataDictCreateReq`） |
| PUT | `/data_dict` | 更新项（`v1.DataDictUpdateReq`） |
| DELETE | `/data_dict/{id}` | 删除项 |
| GET | `/data_dict/options` | 全量选项（按分类 code 分组的 map），业务下拉用 |
| GET | `/data_dict/code?code=` | 单个分类的选项列表，业务下拉用 |

后两个是给**业务页面**（表单下拉）用的，管理模块未使用（已实测不需要）。

> 注意：`GET /data_dict` 的 query **没有 `field` / `order`**，因此本模块的列表不支持列排序。

## 2. 实测结构（与 features 的关键差异）

### 2.1 分类树：无参、一次全量

实测顶层 13 个、共 60 个节点、深度 2：

```json
[{ "id": 38, "parent_id": 0, "id_path": "/0/", "p_code": "common",
   "name": "公共定义", "code": "common", "status": 1, "type": 2, "sort": 0,
   "remark": "", "created_at": 1751982808, "children": [
     { "id": 39, "parent_id": 38, "id_path": "/0/38/", "p_code": "common.channel",
       "name": "渠道包", "code": "channel", "status": 1, "type": 2, "sort": 0 }
   ] }]
```

- **与 features 最大的不同**：features 需要 `menu_id` 限定子树（还得防着不带参数拖出旧系统菜单），这里**无参数直接给整棵树** —— 所以**没有** `MENU_ROOT_ID` 那种根 id 硬编码。
- 两个 code 别混：
  - `code` = **局部码**（`channel`）；
  - `p_code` = **从根到自身的完整 code 链**（`common.channel`）；
  - `id_path` = **祖先 id 链、不含自身**（`/0/38/`，与 features 的 `id_path` 语义一致）。
- 时间字段是**秒级数字**，且存在脏值（曾见到 `created_at: 54353`）→ 渲染走容错解析（`-data/data-dict-options.ts` 的 `toEpochMs`）。
- `parent_id` 用 `0` 表示后端视角的顶级；自本模块收窄到根分类 `DICT_ROOT_TYPE_ID` 之后，前端不再直接使用 `0`。

### 2.2 字典项：独立资源 + 服务端分页

实测 `total: 187`：

```json
{ "total": 187, "items": [
  { "id": 112, "type_id": 39, "code": "common.channel", "label": "google play",
    "value": "1", "status": 1, "is_default": 1, "sort": 0, "remark": "",
    "update_by_user": { "uid": 1, "username": "adm123", "nick_name": "adm123" },
    "created_at": 1751982808, "updated_at": 1751982808, "data_type": null }
]}
```

- **同一分类下的项 `code` 完全相同**（实测 `type_id=39` 的 6 条 code 都是 `common.channel`）——由后端按分类生成，`CreateReq` / `UpdateReq` 里确实没有 `code` 字段。
  → 因此列表里 `code` 仍保留在列白名单里，但**默认不再收起**（默认展示全部字段，用户可在「显示选项」里自行收起）。
- `update_by_user` 是内嵌的用户对象（列表直接可展示操作人）。
- `type_id` 过滤实测有效（`type_id=39` → 6 条）。

### 2.3 请求体字段

| 资源 | 必填 | 可选 |
| --- | --- | --- |
| 分类 Create | `code`、`name`、`status`(1/2)、`type` | `parent_id`、`sort`、`remark` |
| 分类 Update | 上述 + `id` | 同上 |
| 项 Create | `label`、`value`、`type_id`、`status`(1/2)、`is_default`(1/2) | `sort`、`remark` |
| 项 Update | 上述 + `id` | 同上 |

实测写入**没有** features 那种 `component` / `path` 占位值约束（本模块不需要占位常量）。

## 3. 两个必须知道的坑（实现时已处理）

1. **openapi 里这两个接口的 response schema 是错的。**
   `/data_dict/type/tree` 与 `/data_dict` 都被声明为 `v1.DataOptions`（`{ options, total }`，其实是 `/data_dict/options` 的类型），与实际返回完全不同。
   → 本模块在 `-data/data-dict-types.ts` 自行声明响应类型与运行时 schema（实际分别是 `DictType[]` 与 `{ total, items }`），
   **请求参数与请求体仍用生成类型**（那些是正确的）。
   断言的落点只有两处（各 hook 的取值点，注释都打了 `⏳`，附删除条件）。
   这是**本仓库唯一一处**自声明响应类型的地方（其余模块的响应类型都以 openapi 生成为准）。
2. **不能照搬 features 的「单棵树本地派生」。**
   这里是**两个数据源**：分类树（全量，做导航与父级）＋ 当前分类的字典项（服务端分页）。
   字典项列表走仓库标准 **`TableControls` + `DataTable` + 服务端分页**（关键词 `kw`、状态 `status`、页码都直接驱动请求）；分类树才做本地搜索过滤。

## 4. 模块结构（已实现）

### 4.1 路由：下钻式（**最终形态**）

| 路径 | 视图 |
| --- | --- |
| `/$appId/system/data-dict` | 分类列表（整棵分类树的树表，可下钻） |
| `/$appId/system/data-dict/$typeId` | 左列自上而下：**基本信息内嵌表单 + 子分类卡片 + 字典项表格**；右列为分类只读元信息卡片；页头只有**启用开关**（受控 `status`，分类改名 / 改编码 / 改键值类型都在内嵌表单里改，表单变脏时由底部 `UnsavedChangesBar` 负责保存 / 重置，**重置靠递增 `resetSeq` 重建表单** —— 与 features 详情页同一套编辑态）；新增子分类的入口统一留在分类列表 |

- **层级返回全部交给顶栏面包屑**：注册后 `/$appId/system/data-dict/39` 显示为
  `首页 / 系统 / 数据字典 / 公共定义 / 渠道包`，祖先分类可点回各自详情 —— 页面内不放返回按钮。
- 详情页**刻意不提供删除当前分类**：分类列表的行内删除已覆盖该动作，详情页再放一个高危按钮
  只会扩大误操作面；需要删除时回列表页操作。
- **新增分类的入口都在分类列表**：工具条的「新增分类」（顶级分类）与该行行内菜单的「新增子分类」；
  详情页只负责查看 / 编辑当前分类，不承接新增。
- **分类的修改只在详情页的内嵌表单里做**：列表行内菜单的「编辑分类」= **导航进该分类的详情页**（不是弹窗）；
  字典项的新建 / 编辑走弹窗、删除走轻量确认；分类的删除在列表行内菜单完成。**不设专门的编辑路由**
  （没有 `/data-dict/$typeId/edit` 之类），详情页本身就是编辑态。

> **形态变更记录（重要，避免再次走弯）**：本模块一度被改成「单页左树右表 + `?type=`」
> （想当然地把「扁平化」理解成双列布局），随后按反馈改回**下钻式双路由**。
> 结论：这里要的是「分类树表 + 下钻详情」这种与 features 一致的结构，
> **不是**左右两栏；层级导航由面包屑承担。若后续再评估布局，先确认这一点。

### 4.2 目录

```
apps/web/src/routes/$appId/system/data-dict/
├── route.tsx                       # 模块根（Outlet）
├── index.tsx                       # /data-dict：分类列表（分类树表）
├── $typeId.tsx                     # 选中分类：子分类卡片 + 字典项表格 + 侧栏信息卡片
├── -components/
│   ├── dict-type-table.tsx         # 分类树表（列表页与详情页「子分类」卡片共用；含增删改）
│   ├── dict-type-form-dialog.tsx   # 分类 新建/编辑 弹窗
│   ├── dict-type-info-card.tsx     # 分类元信息只读卡片（详情页侧栏）
│   ├── dict-item-table.tsx         # 字典项表格（TableControls + 服务端分页 + 行操作）
│   └── dict-item-form-dialog.tsx   # 字典项 新建/编辑 弹窗
└── -data/
    ├── data-dict-types.ts          # ⚠️ 自定义响应类型 + 运行时 schema（第 3 节第 1 条）
    ├── data-dict-options.ts        # 枚举、树工具（查找/过滤/统计）、toEpochMs、分页默认值
    ├── data-dict-columns.tsx       # 两张表的列编排 + 枚举徽章
    ├── data-dict-breadcrumb.ts     # 把分类层级注册给顶栏面包屑（两个 owner）
    ├── use-dict-type-tree.ts       # 分类树单一数据源 + 失效
    └── use-dict-items.ts           # 分页列表 query（服务端分页 + kw + status）+ 失效
```

### 4.3 数据层要点

- `useDictTypeTree()`：`getDataDictTypeTreeQueryOptions()`，**全量树**（无参数），随后在本地收窄到
  `DICT_ROOT_TYPE_ID`（67）：返回 `nodes`（根分类的**直接子分类**，即模块可见的最顶层）与 `root`（根分类自身）。
  因为接口不支持按节点过滤，收窄必须在前端做；分类增删改后整棵树失效。
  - 根分类不在接口返回里时（后端换了根）**明确报错**（`messages.rootMissing`），不回落成「未找到」，也不展示整个历史树。
  - `/$appId/system/data-dict/67` 会被 `beforeLoad` 规范化重定向到分类列表（列表页展示的正是 67 的直接子分类），避免出现「根分类自己作为一个分类」的重复视图。
- 分类树的**本地搜索**（接口没有关键词参数）由 `filterDictTypeTree()` 完成：**只保留命中节点 + 其祖先链** ——
  命中节点的下级若没匹配上也不出现在结果里，即搜索给的是「精确相关的分支」而不是整棵子树；
  展开态跟随搜索：**默认折叠、关键词非空时把过滤结果里的分支节点按行 id 显式展开、清空后回到折叠** ——
  过滤后只剩相关分支，全展开即等于「展开到命中项」，避免命中的深层分类藏在折叠态里看不见。
  注意 TanStack Table v9 的 `expanded: true`（全部展开特例）在本项目的 features 组合下不生效，
  必须写成 `{ [rowId]: true }` 的 id 映射。
- `useDictItems({ typeId, keyword, status, page, pageSize, enabled })`：`getDataDictQueryOptions({ query })`，
  queryKey 含全部参数；项的增删改后按 `getDataDictQueryKey()` **前缀失效**（覆盖所有分类 / 页码 / 关键词组合）。
  `enabled` 用于「删除分类前查一次有没有字典项」这种按需查询。
- **树表的参考实现**：分类树用 `treeTableFeatures` + `<DataTable tree />`（**层级列固定第一列**）——
  `useTable({ features: treeTableFeatures, getSubRows: (row) => row.children, getRowId: (row) => String(row.id), state: { expanded } })`，
  **默认折叠**（搜索时自动展开、清空关键词回落折叠）；树表**不开放列排序**（会打乱父子层级）。
- **枚举语义**：分类 `type` = **键值类型**（`1 = string` / `2 = number`，依据旧后台 `data_dict/data.ts` 的 `typeFormSchema`），
  `status` **1 = 启用 / 2 = 禁用**；字典项 `is_default` **1 = 是 / 2 = 否**（单选，前端不做唯一性校验，见第 6 节）。
- 写入用生成的 `postDataDictTypeMutation` / `putDataDictTypeMutation` / `deleteDataDictTypeByIdMutation`
  与 `postDataDictMutation` / `putDataDictMutation` / `deleteDataDictByIdMutation`（`mutationAsync({ body })` / `({ path: { id } })`）。
  **不要拿同名的 SDK 函数当 mutation 用** —— 生成产物里 mutation 工厂带 `Mutation` 后缀，SDK 函数是另一支（`postDataDict` ≠ `postDataDictMutation`）。
- **写入成功后的失效一并调用**：`useInvalidateDictTypeTree()`（分类增删改）与 `useInvalidateDictItems()`
  （字典项增删改，失效范围同上一段的 `getDataDictQueryKey()` 前缀失效）。
- **面包屑注册分两个 owner**（`system:data-dict:detail` / `system:data-dict:list`）：列表页与详情页
  可能**同帧挂载**，共用一个 owner 会互相覆盖注册项；另外**树未加载时不要注册空表**。
- **字典项文案的多语言不在本模块**：后端 `label` 仍是单语言字段，**管理端要显示的枚举值文案**由前端字典文案库
  `apps/web/src/messages/dict/<模块>/<locale>.json` 承载，名称列经 `#/lib/dict-messages` 的 `<DictItemText>` 渲染
  （回落链：字典文案 → 后端 `label` → `value`）。目录约定与工作流见 [dict-i18n.md](./dict-i18n.md)。
  管理界面里**编辑**的仍是后端 `label`（那里展示的是库里的真实数据），两者不要互相覆盖。
- **编码列展示走命名空间适配**：后端返回的分类 `p_code` / 字典项 `code` 带临时命名空间
  （`new.user.account-type`），前端呈现与复制统一走 `#/lib/dict-key` 的 `displayDictCode()`
  剥成逻辑 code（`user.account-type`）；旧命名空间（`common.channel`）原样显示、不丢信息。
  涉及分类树表的 `p_code` 列、字典项表的 `code` 列、详情页「完整编码」卡片与面包屑名称回落。
  字典项的 `value` 是业务值，**不**做这层处理。

### 4.4 复用的既有能力

| 能力 | 来源 |
| --- | --- |
| 不可逆操作二次确认（输入名称 + 一键复制） | `#/components/danger-confirm-dialog`（分类删除） |
| 轻量删除确认（叶子节点） | `LayerDialog.Alert`（字典项删除，参照 features 的权限删除） |
| 弹窗表单（`LayerDialog` + `form` 属性提交） | 参照 `features/-components/feature-form-dialog.tsx`，本模块另写两份 |
| 表格能力 | `TableControls`（搜索 / 刷新 / 列设置）+ `DataTable`（列设置、服务端分页、sticky 操作列、树表 `tree`：层级列固定第一列） |
| 顶栏面包屑层级注册 | `#/lib/breadcrumb-trail`（分类树拍平成「路径 → 名称 + 父级路径」） |
| 可复制值 / 一键复制 | `#/components/copyable-value` |
| 全局错误提示与业务码拦截 | 已由 API 拦截器统一处理，页面 `extractApiErrorMessage` 取文案 |
| RTL 注意点 | `DropdownMenu.Item` 不用 `icon`（改 children + `gap-2`）；操作列写 `meta.sticky: 'right'` + `text-end` |

### 4.5 接口映射（UI 动作 → 接口）

| 动作 | 接口 |
| --- | --- |
| 分类树加载 | `GET /data_dict/type/tree`（全量，驱动左侧树，全局唯一分类数据源） |
| 新建子分类 / 顶级分类 | `POST /data_dict/type`（`parent_id` = 当前分类 / `0`） |
| 编辑分类 | `PUT /data_dict/type`（详情页**内嵌表单**提交，显式回传原 `parent_id`，避免被当成根层级移走）；列表行内菜单的「编辑分类」只是进入该详情页，不再弹窗编辑 |
| 删除分类 | `DELETE /data_dict/type/{id}`（前端两层拦截，见第 6 节） |
| 字典项列表 | `GET /data_dict?type_id=&kw=&status=&page=&page_size=` |
| 新建 / 编辑 / 删除项 | `POST` / `PUT` / `DELETE /data_dict`（`type_id` = 当前分类） |
| 删除分类前的字典项检查 | `GET /data_dict?type_id=&page_size=1`（只读 `total`） |

## 5. 固定值与临时值

| 值 | 情况 |
| --- | --- |
| `DICT_ROOT_TYPE_ID = 67` | ⏳ **临时值**：架构升级期由后端指定的字典**根分类 id**。接口 `GET /data_dict/type/tree` 是无参全量（一次给全部 13 个历史顶层、60 个节点），本模块靠这个常量**在本地把范围收窄**到它的子树。删除条件：后端提供「当前应用的字典根分类」查询、或由 App 配置下发根 id 后改为运行时获取 |
| 响应类型与断言 | ⏳ 后端修正两个接口的 Apifox 定义后，删掉 `data-dict-types.ts` 的自声明类型/schema 与两处断言 |
| 时间容错 | 秒级数字 + 脏值，`toEpochMs` 容错解析 |
| 分页默认值 | `DEFAULT_PAGE_SIZE = 15`（与用户列表 / 功能列表一致） |

> **清理入口：全局搜索 `⏳`。** 本模块的临时项只有两处：「响应 schema 错误」（3 个文件的说明与断言）与「根分类 id 67」。

## 6. 待确认项结论（动工前拍板结果）

1. **分类的 `type`（1/2）语义** → **`1 = string`、`2 = number`（键值类型）**。
   依据：旧后台 `旧后台 apps/web/src/views/data_dict/data.ts` 的 `typeFormSchema` 中，该字段 label 为「键值类型」、
   helpMessage 为「确定键值的数据类型」，选项正是 `{ label: 'string', value: 1 }` / `{ label: 'number', value: 2 }`
   （openapi 里只有一句无信息量的「数据类型」）。表单据此做成 `Radio.Group`（string / number）。
2. **删除约束** → 前端按 features 约定**主动拦截**，两层：
   - 有**直接子分类**（本地树上可见 `children`）→ 点删除直接 toast 提示，不弹窗；
   - 没有子分类但**有字典项** → 弹窗打开后用 `GET /data_dict?type_id=&page_size=1` 查一次 `total`（只取 1 条），
     非 0 时弹窗内就地说明原因（确认按钮需要输入名称，实际无法通过）。
     这一步是必要的：**列表接口不返回字典项数量**，只看本地树会把「有项的叶子分类」放过去。
   - 字典项删除仍是后端为准（前端不预检，失败经拦截器以 toast + 弹窗内错误呈现）；
     后端是否约束「项被引用时不可删」尚未实测，属于**未验证项**。
3. **布局形态** → **下钻式**（与 features 一致）：分类列表 + 分类详情两个路由，层级由面包屑承担，
   不采用左树右表的双列布局（见 4.1 的形态变更记录）。
   - 后续追加：**模块范围收窄到根分类 `DICT_ROOT_TYPE_ID`（67）**（架构升级期约定），
     列表页 = 67 的直接子分类，面包屑从 67 的下级开始。
4. **`is_default` / `sort`** → `is_default` 做成单选「是 / 否」（提交 1 / 2），
   前端**不做**同分类唯一性校验（后端是否要求唯一未确认，避免误拦）；`sort` 为数字输入框，不做拖拽排序。
5. **i18n 范围** → `dataDict` 命名空间当前**只有 `zh-CN`**，其余 6 语言回退中文（与 features 一致）。
6. **字典项 `label` 的多语言** → **前端承载**，不给后端 `data_dict` 加 `language` 字段：
   文案放 `apps/web/src/messages/dict/<模块>/<locale>.json`，按模块懒加载，约定见 [dict-i18n.md](./dict-i18n.md)。
   理由：翻译入库会随字典量放大后端内存与查询成本，而管理端文案并不需要运行期可改；
   代价是文案随前端版本发布，且**后台改 `label` 不会覆盖已收录项的展示文案**（`label` 只作兜底）。

### 仍未验证 / 待办

- 浏览器端交互（树表展开、下钻、两个弹窗、删除拦截、面包屑逐级返回、窄屏与 `ar-SA` RTL、sticky 侧栏）尚未人工逐项验收。
- `GET /data_dict` 是否真的支持 `kw` / `status` 的**服务端**过滤（文档第 1 节来自接口声明与既有实现）；
  若后端实际忽略这些参数，需要改成前端过滤 + 本地切片（届时 `use-dict-items.ts` 的 `page_size` 用法要一并调整）。
- 字典项的删除约束、`is_default` 唯一性、分类 `code` 是否允许重复 —— 均以**后端为准**，前端未做假设。
- 本机 `pnpm typecheck` 与 `pnpm build`（约 1.5s）均通过；`pnpm dev` 正常。若 build / dev 报 `@rolldown/binding-darwin-universal` 缺失，是**所用 node 与 rolldown 原生 binding 签名不匹配**（换系统 node，如 `/opt/homebrew/bin/node` 即可），与代码无关。

## 7. 建议实施顺序（对照实际落地）

1. ✅ **数据层**：`data-dict-types.ts`（自定义类型 + 运行时 schema）+ `use-dict-type-tree` / `use-dict-items`；
2. ✅ **只读跑通**：分类树导航（含本地搜索）+ 字典项表格（服务端分页、关键词与状态筛选）；
3. ✅ **写操作**：分类与项的弹窗表单、分类两层删除拦截、字典项轻量删除确认；
4. ✅ **收尾**：i18n（zh-CN）、`⏳` 标注、导航项（`nav.systemDataDict`）、面包屑注册、本文档回填；
5. ✅ **形态校正**：一度误改为单页左树右表，已按反馈恢复下钻式双路由（见 4.1 变更记录）；
6. ⏳ 人工验收后清理临时断言（后端修 schema 后）。

## 8. 相关文档

- [字典多语言文案库](./dict-i18n.md)：字典项枚举值的前端多语言目录、回落链与工作流
- [字典选项获取层](./dict-options.md)：`/data_dict/options` 的取值封装、临时 `new.` 命名空间的适配层与进应用预取
- [配置 → 语言包模块现状](./lang-module.md)：`/lang` 翻译表（服务于下发给 C 端 App 的文案），第 4 节有两者分工
- [功能（Features）模块现状](./features-module.md)：本次参考/复用的骨架
- [AGENTS.md](../AGENTS.md) 第 6 节：API 客户端、错误处理与模块约定
- skill `.agents/skills/table-development/SKILL.md`：表格与筛选控制栏规范
