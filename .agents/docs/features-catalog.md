# 功能说明与测试清单

> **两个用途**：① 一眼看清「现在到底有哪些功能、谁有权限、AI 能做什么」；
> ② 回归测试照着点，不用读代码。
>
> 每个模块一节，格式固定：**入口 → 功能 → 权限 → AI 指令 / 数据源 → 测试清单**。
> 新增页面时在对应模块下补一节；AI 声明以该页的 `feature.ts` 为准（别在本文档里抄第二份字段）。
>
> **两份文档的分工**：[features-architecture.md](./features-architecture.md) 说"代码该怎么写"，
> 本文档说"现在有什么、怎么测"。迁移进度以架构文档 §6 为准。

## 模块索引

| 模块 | 迁移状态 | 本节内容 |
| --- | --- | --- |
| 表格示例（`$appId/example/user`） | ✅ 已迁移并扁平化 | 功能 / 权限 / 5 条 AI 指令 / 数据源 `rows` / 20 条测试 |
| 表格示例详情（`$appId/example/user/$id`） | ✅ 已迁移 | 只读页：数据源 `record`、无指令 / 3 条测试 |
| 表格示例 新建 · 编辑（`…/new`、`…/$id/edit`） | ✅ 已迁移 | 表单桥（fill_form / submit_form）/ 4 条测试 |
| 复杂表格（`$appId/example/complex-table`） | ✅ 新增 | 分组表头 / 展开行 / 列显隐 / 行选择 / 汇总行 / 数据源 `rows` + 3 条 UI 指令 / 6 条测试 |
| 功能菜单树 · 详情（`$appId/system/features`） | ✅ 已迁移 | 三落点 / 数据源 ×3 + 表单桥（详情）/ 18 条测试 |
| 数据字典分类列表（`$appId/system/data-dict`） | ✅ 已迁移 | 功能 / 接口 / 数据源 `dict-types`（无指令）/ 12 条测试 |
| 数据字典分类详情（`$appId/system/data-dict/$typeId`） | ✅ 已迁移 | 三段式页面 / 数据源 ×2 + 表单桥 / 15 条测试 |
| 仪表盘（`$appId/home`） | ✅ 已迁移 | 8 列自由栅格 + 卡片注册表 / 数据源 ×2 + 3 条 AI 指令 / 15 条测试 |
| AI 助手（面板 / 全屏） | — | 面板两形态 / 全屏页 / 会话 / 输入区 / 卡片 / 15 条测试 |
| 跨模块约定（AI 相关） | — | 权限·模式·跳转·写操作·页面数据·范围闸（测试时对照） |

## example / 表格示例（`$appId/example/user`）

**代码**：`src/features/table-example/{index.tsx,feature.ts,columns.tsx}` · 路由 `src/routes/$appId/example/user/index.tsx`

**功能**
- 分页列表（默认 15 条/页）、关键词搜索（`kw`）、多字段精确/范围筛选、服务端排序
- 列设置（本机偏好，按应用隔离持久化）、多选与批量删除
- 行菜单：查看（详情预览）/ 编辑 / 删除
- 新建记录（按「表单打开方式」偏好：弹窗 / 分屏 / 独立页）
- 详情预览（分屏 / 抽屉 / 跳转独立页，随「详情打开方式」偏好）
- 接口不可用时回落演示数据（不白屏）

**权限点**：`table-example:create` · `table-example:edit` · `table-example:delete`（`table-example:read` 由路由守卫与导航使用）

**接口**：`GET /user` · `POST /user` · `PUT /user` · `DELETE /user/{id}` · `POST /user/batch-delete`
（Mock 的 `/user` 接口路径**刻意保持不变**：改路径要同步契约产物，而权限 key / 模块名已统一为 `table-example`。）

**AI 指令**（`run_page_command`，id 与页面按钮一一对应）

| id | 何时用 | 类型 | 确认卡 |
| --- | --- | --- | --- |
| `create-record` | 用户要求新建记录 | navigate | 不需要（只是把表单摆出来） |
| `edit-record` | 用户要求改某条记录（传 `id`） | navigate | 不需要 |
| `open-detail` | 用户要看某条记录的详情（传 `id`） | navigate | 不需要（页面内分屏 / 抽屉 / 跳转） |
| `delete-record` | 删除单条（传 `id`） | write | **必须**（标注不可撤销） |
| `batch-delete-records` | 多选/多目标删除（传 `ids`） | write | **必须** |

**AI 数据源**：`rows` —— 当前页的记录行（id/nickname/email/createtime/logintime）
+ 状态（关键词、筛选、分页、排序、总数、选中项、是否演示数据）。

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/nivo/example/user` | 表格渲染、分页 15 条/页、无控制台报错 |
| 2 | 搜索「张」 | URL 出现 `kw=张`、页码回 1、表格只剩匹配行 |
| 3 | 高级筛选：注册时间范围 | 生效条件 chip 出现、表格按范围过滤 |
| 4 | 点列头 `createtime` 排序 | URL 出现 `field=createtime&order=…`、顺序变化 |
| 5 | 列设置里隐藏「邮箱」 | 列消失；刷新后仍隐藏（本机偏好） |
| 6 | 行菜单 → 删除 → 确认 | toast「删除记录成功」、该行消失、总数 -1 |
| 7 | 勾选 2 行 → 批量删除 → 确认 | toast「成功删除 2 条记录」、行消失、选中清空 |
| 8 | 新建记录（三种打开方式各试一次）→ 提交 | toast「创建记录成功」、列表出现新记录 |
| 9 | 点行 / 点昵称 | 按偏好打开详情（分屏 / 抽屉 / 跳转），数据正确 |
| 10 | **AI·面板**：问「这一屏有多少条记录、都有谁」 | 调 `get_page_data`（**不再调接口**），回答与表格一致；数据含当前筛选与分页 |
| 11 | **AI·面板**：说「把 XXX 删掉」 | 调 `run_page_command(delete-record)` → **确认卡**（含「执行后无法撤销」）→ 允许 → toast + **表格自动刷新** |
| 12 | 承上，点「先不跳/拒绝」 | 工具报错，AI 说明被拒绝、**不重试同一条指令** |
| 13 | **AI·面板**：说「新建一条叫测试的记录」 | `open_form` 打开表单并预填 → `submit_form` 确认卡 → 提交 → 列表出现 |
| 14 | **AI·面板**：说「带我去表格示例」 | 跳转确认卡（带我去 / 本会话自动跳转 / 先不跳）；「本会话自动跳转」后再次跳转不再问 |
| 15 | **AI·全屏**：说「看看表格示例」 | 不跳转；就地渲染表格 + 一张建议卡；`get_page_data` 不可用（工具未下发） |
| 16 | 设置 → AI → 权限切「只读」 | AI 不再有 `run_page_command` / `call_write_api`；被要求删除时如实回答"权限没开" |
| 17 | 切到 `ar-SA` | RTL 布局正常、新增文案齐全（列名 / 卡片 / 设置项） |
| 18 | 关掉 mock（`pnpm mock`）后刷新 | 回落演示数据、页面不白屏 |
| 19 | **AI·面板**：说「看一下 XXX 的详情」 | `run_page_command(open-detail)` → 按偏好打开详情预览（不跳页）；id 不在这一屏时明确报错、不打开空壳 |
| 20 | **AI·面板**：删除后立即问「现在这一屏还有谁」 | `get_page_data` 返回的是**刷新后**的数据（`reload` 已生效） |

## example / 表格示例详情（`$appId/example/user/$id`）

**代码**：`src/features/table-example/{detail-page.tsx,detail-feature.ts,detail-view.tsx,detail-loader.ts}`

**功能**：查看单条记录资料（昵称/邮箱/注册时间等）、返回列表；**同一组件也被列表页的分屏预览复用**。

**AI 声明**：描述 + 实体 + `GET /user`（按 `kw` 精确查一条）+
**数据源 `record`**（页面加载好的那一条记录 + `loading` / `demoMode` / 路由上的 id）。
**它是只读页，没有 `commands`** —— 指令与页面入口一一对应，这里没有会改数据的按钮。

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 直接访问 `/nivo/example/user/10001` | 详情渲染、返回按钮回到列表 |
| 2 | **AI·面板**：问「这条记录的注册时间和邮箱」 | 走 **`get_page_data`**（数据源 `record`），**不再调接口**；答案与页面一致 |
| 3 | AI·面板：在详情页要求删除这条记录 | 该页没有删除指令 → 模型应回答"这一页不能删，去列表页"或提议 `navigate_to` 列表页，**不会静默调用 `call_write_api` 绕过页面** |

## example / 表格示例 新建 · 编辑（`$appId/example/user/new`、`$appId/example/user/$id/edit`）

**代码**：`src/features/table-example/{create-page.tsx,create-feature.ts,edit-page.tsx,edit-feature.ts}`、共用表单 `src/features/table-example/{form-view.tsx,form-dialog.tsx}`

**功能**：表单录入 / 修改（昵称必填，邮箱与头像可选），提交后 toast + 返回列表。

**AI 声明**：表单字段与提交接口（`POST /user` / `PUT /user`）+ 表单桥
（`useAiFormFields` / `useAiFormSubmit`）：AI 可 `fill_form` 填字段、`submit_form` 提交（走审批卡）。

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 新建页只填邮箱提交 | 昵称校验报错、不提交 |
| 2 | 编辑页改昵称提交 | toast「更新记录成功」、返回列表且列表显示新昵称 |
| 3 | AI·面板：在新建页说「昵称填 测试A，邮箱 a@b.com」 | `fill_form` 写入字段（ask 模式先确认），输入框可见 |
| 4 | AI：说「提交」 | `submit_form` → 确认卡 → 允许 → 成功；表单未变脏时直接拒绝、不弹卡 |

## example / 复杂表格（`$appId/example/complex-table`）

**代码**：`src/features/complex-table/{index.tsx,feature.ts,columns.tsx,data.ts}` · 路由 `src/routes/$appId/example/complex-table/index.tsx`

**功能**
- 分组表头（基本信息 / 分类与状态 / 数量与金额）
- 可展开的父子行（订单 → 订单明细）
- 列显隐（`TableControls` 的「显示选项」）
- 行选择与清空选择
- 汇总行（订单数 / 合计数量 / 合计金额）

**权限点**：`table-example:read`（只读示例）

**接口**：无 —— 数据为前端本地构造（`./data.ts`），示例页不新增契约。

**AI 指令**：`expand-all-rows` / `collapse-all-rows` / `clear-row-selection`（UI 状态操作，直接执行）。

**AI 数据源**：`rows` —— 当前展示的订单与明细行 + 状态（关键词、展开项、选中项）。

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/nivo/example/complex-table` | 多级表头渲染、无控制台报错 |
| 2 | 点第一列展开箭头 | 展开订单明细；再点折叠 |
| 3 | 「显示选项」隐藏「单价」 | 列消失、分组表头仍然正常 |
| 4 | 勾选若干行 | 头部出现「已选择 N 项」与清空按钮 |
| 5 | 底部汇总行 | 订单数 / 合计数量 / 合计金额随筛选变化 |
| 6 | **AI·面板**：说「展开全部」「折叠全部」 | 调 `run_page_command(expand-all-rows / collapse-all-rows)`，表格展开态随之变化 |

## system / 数据字典分类列表（`$appId/system/data-dict`）

**代码**：`routes/$appId/system/data-dict/{index.tsx,route.tsx}` · `-components/dict-type-table.tsx` ·
`-data/{use-dict-type-tree.ts,data-dict-options.ts,data-dict-breadcrumb.ts,data-dict-columns.tsx,data-dict-types.ts}`

**功能**
- 树表展示**根分类（`DICT_ROOT_TYPE_ID`）的直接子分类**；可展开子分类、按名称搜索（只保留命中节点 + 其祖先链）
- 统计「共 N 项」按**过滤后树的节点总数**算（随搜索变化，与展开后的行数一致）
- 行菜单：查看子分类 / 编辑 / 删除；页头动作区含刷新与「新建分类」
- 删除有确认弹窗（`DangerConfirmDialog`）；**有子分类或字典项的删除由后端拒绝**并回显原因
- 点分类名下钻到分类详情；分类层级注册进顶栏面包屑
- 根分类自身不出现在列表里，也不提供编辑 / 删除入口（它是模块边界）

**权限点**：无（本模块尚未做权限声明）

**接口**：`GET /data_dict/type/tree`（**无参全量**，一次拉整棵树）· `POST /data_dict/type`（新建）·
`PUT /data_dict/type`（更新）· `DELETE /data_dict/type/{id}`（删除）

**AI 声明**：✅ **已接入**（`src/features/data-dict/list/feature.ts`）
- **数据源** `dict-types`：根分类的直接子分类 + 它们的 `children`（id / name / code / 类型 / 状态 / 排序 / 备注）
  —— 用户问「有哪些分类」「某个分类下有什么」时**直接读页面数据，不用再拉全量树**
- **`reload`**：写操作后重新取数
- ⚠️ **暂无 `commands`**：新建 / 删除分类的弹窗状态在 `dict-type-table.tsx` 内部，页面拿不到句柄 ——
  与其声明一条"看着能删其实没删"的指令，先不声明（补齐方式见 features-architecture.md §7）

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/nivo/system/data-dict` | 只显示根分类的直接子分类，根分类自身不在列表里 |
| 2 | 展开某个分类 | 子分类出现；缩进与左侧竖线正常（RTL 下在另一侧） |
| 3 | 搜索一个子分类名 | 只保留命中节点 + 祖先链；统计数字随之变小 |
| 4 | 清空搜索 | 树回落折叠状态 |
| 5 | 点分类名 | 下钻到 `/$typeId`；顶栏面包屑显示「首页 / 系统 / 数据字典 / …」且祖先可点 |
| 6 | 「新建分类」→ 提交 | toast 成功、树里出现新分类 |
| 7 | 删除一个**有子级**的分类 | 确认后后端拒绝，原因回显，列表不变 |
| 8 | 删除一个空分类 | 确认后成功、从树里消失 |
| 9 | 接口不可用（关掉 mock） | 表格错误态 + 「重试」；点重试重新拉取 |
| 10 | 切 `ar-SA` | RTL 正常、树缩进与竖线在右侧 |
| 11 | **AI·面板**：问「有哪些分类 / 公共定义下有什么」 | 走 `get_page_data`（数据源 `dict-types`），**不再调接口**；列表与页面对得上 |
| 12 | **AI·面板**：问「能不能帮我删掉某个分类」 | 该页**没有删除指令** → 模型应说明页面上怎么删（或引导去操作），**不会静默调 `call_write_api` 绕过前端拦截** |

## system / 数据字典分类详情（`$appId/system/data-dict/$typeId`）

**代码**：`routes/$appId/system/data-dict/$typeId.tsx` ·
`-components/{dict-type-form.tsx,dict-type-form-dialog.tsx,dict-type-info-card.tsx,dict-item-table.tsx,dict-item-form-dialog.tsx}` ·
`-data/{use-dict-items.ts,use-dict-type-tree.ts,data-dict-options.ts}`

**功能**
- 一页三段（左列自上而下）：**分类自身**（内嵌可编辑表单）、**子分类树表**、**该分类的字典项表格**
- 表单是**草稿式**：改动后底部出现「未保存更改」浮条（保存 / 重置）；保存走 `PUT /data_dict/type`
- 状态开关（`Switch`）随表单一起提交；值类型等枚举一律走字典域的文案键映射
- 字典项表格：**服务端分页 + 关键词搜索 + 状态筛选**，新建 / 编辑 / 删除（删除有确认弹窗、失败原因回显）
- 只读信息卡片（分类 id / 父分类等）；**根分类不可编辑、不可删除**
- 面包屑逐级可点回祖先分类

**权限点**：无（尚未声明）

**接口**：`GET /data_dict/type/tree` · `PUT /data_dict/type` · `GET /data_dict`（分页 + `kw` / `status`）·
`POST /data_dict` · `PUT /data_dict` · `DELETE /data_dict/{id}`

**AI 声明**：✅ **已接入**（`src/features/data-dict/detail/feature.ts`）
- **数据源** `dict-type`：当前分类（id / 名称 / 编码 / 键值类型 / 状态 / 排序 / 备注 / 上级分类名）
  + `hasUnsavedChanges`（用户刚改过还没保存时，AI 答得出来）
- **数据源** `sub-types`：它的子分类
- **表单桥已接**：`dict-type-form.tsx` 注册字段读写（`aiFormId` 由详情页传入）、详情页注册提交
  → AI 可 `fill_form` 填字段、`submit_form` 走**审批卡**保存；`canSubmit` 复用 `isDirty`（没改动直接拒绝）
- ⚠️ **字典项列表不进数据源**：它由子组件 `DictItemTable` 自持（服务端分页 + 筛选），页面拿不到那一屏 ——
  要读字典项时 AI 用 `search_api` + `call_read_api`，`type_id` 从 `dict-type` 数据源里取

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 从列表点分类进入详情 | 三段都渲染；面包屑正确 |
| 2 | 改分类名 → 保存 | 底部先出现「未保存更改」浮条；保存后 toast 成功、树里名称更新 |
| 3 | 点「重置」 | 表单回到服务端值、浮条消失 |
| 4 | 切换状态开关 → 保存 | 保存后开关与徽章状态一致 |
| 5 | 清空必填（名称 / 编码）后保存 | 校验拦截、**不发请求** |
| 6 | 字典项表格：搜索 + 状态筛选 + 翻页 | 结果与条件一致（该表格的分页在**本地 state**，不进 URL） |
| 7 | 新建字典项 → 提交 | toast 成功、列表出现且统计更新 |
| 8 | 编辑字典项：键值填成同分类下重复值 | 后端拒绝并回显原因 |
| 9 | 删除字典项 | 确认弹窗 → 成功后行消失 |
| 10 | 直接访问根分类（67）详情 | 不提供编辑 / 删除入口 |
| 11 | **AI·面板**：问「这个分类的编码和键值类型」 | 走 `get_page_data`（数据源 `dict-type`），**不调接口** |
| 12 | **AI·面板**：说「把名称改成 XXX」 | `fill_form` 写入字段（询问模式先确认）→ 输入框可见新值 |
| 13 | **AI·面板**：承上说「保存」；以及**没改动时说「保存」** | 有改动 → `submit_form` 审批卡 → 允许 → toast + 浮条收起；没改动 → **直接拒绝、不弹卡** |
| 14 | **AI·面板**：填入非法名称（1 个字符）后说保存 | 前端校验拦住、不发请求，AI 如实说明失败（表单桥把失败翻成异常） |
| 15 | 切 `en-US` / `ar-SA` | 文案齐全、RTL 正常 |

## home / 仪表盘（`$appId/home`）

**代码**：`src/features/home/{index.tsx,feature.ts,widget-registry.tsx,use-dashboard-grid.ts,dashboard-grid.tsx,dashboard-widget-frame.tsx,add-widget-dialog.tsx,*-card.tsx}` ·
薄路由 `routes/$appId/home/index.tsx` · 布局类型 `#/lib/dashboard-layout`、持久化 `#/lib/store/dashboard-store`

**功能**
- 用户可自定义的**自由栅格工作台**：卡片按 `x / y / w / h` 落格
- 编辑模式：**拖动换位**（指针）、**拖右下角手柄改尺寸**（指针 + 键盘方向键微调）、**添加卡片**（弹窗只列还没加的）、**移除卡片**
- **即时保存**：每次拖动 / 添加 / 移除立刻写进 `admin.dashboard:<appId>`（**没有保存按钮**，「完成」只是退出编辑）；按应用隔离
- 空布局时显示空态引导；「重置布局」回到默认（带 toast）
- 卡片来自**注册表** `DASHBOARD_WIDGETS`（铁律 3 的唯一真值）：概览 / 快捷操作 / 指标 / 版本 四张；布局带 `DASHBOARD_LAYOUT_VERSION`（将来迁移用）

**权限点**：无 —— 模块注释明确「自定义能力是放开的，不做权限裁剪」；等权限模型明确后在**注册表**加
`requiredPermission`、在添加弹窗里过滤（收敛点已经留好）

**接口**：无（页面本身不取数；四张卡片目前是本地/演示内容，未接后端）

**AI 声明**：✅ **已接入**（`src/features/home/feature.ts`，页面一次 `useFeature`）
- **数据源** `widgets`：当前卡片（实例 id / 类型 / 标题 / `x,y,w,h`）+ 状态（是否编辑模式、是否默认布局、卡片数）
- **数据源** `available-widgets`：注册表里的全部卡片类型（标题 / 说明 / 是否已添加 / 是否允许多张）
- **指令**（`run_page_command`）：`add-widget`（传 `type`，**不弹卡** —— 可逆、只动本机布局）、
  `remove-widget`（传**实例 id**，会弹确认卡）、`reset-dashboard-layout`（**不可撤销**，弹确认卡）
- 页面本身**没有接口**，所以 AI 不存在"再查一遍"的问题；这套声明的价值是"用户问这页有什么卡片"能直接答

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/nivo/home` | 默认布局渲染；卡片标题 / 描述取自 `dashboard` 命名空间（7 语言） |
| 2 | 点「自定义」 | 进入编辑态：出现拖拽 / 缩放手柄与「添加卡片 / 重置 / 完成」 |
| 3 | 拖动一张卡片换位 | 松手即保存；**刷新后位置保持** |
| 4 | 拖右下角手柄改尺寸 | 尺寸保留；刷新后保持 |
| 5 | 键盘聚焦手柄 + 方向键 | 尺寸可微调（可访问性；RTL 下方向语义正确） |
| 6 | 移除一张卡片 | 立即消失；刷新后**不回来**（即时保存） |
| 7 | 打开「添加卡片」 | 只列**尚未添加**的卡片；添加后出现在栅格中 |
| 8 | 移除全部卡片 | 显示空态引导；从空态可重新添加 |
| 9 | 点「重置布局」 | 提示 toast + 回到默认布局 |
| 10 | 切到另一个应用再回来 | 布局按应用隔离（`admin.dashboard:<appId>`），互不影响 |
| 11 | 设置 → 外观关掉「界面动效」 | 拖动 / 进出场无动画，功能不受影响 |
| 12 | 切 `ar-SA` | RTL 下栅格与拖拽仍按行首方向对齐，不错位 |
| 13 | **AI·面板**：问「我这页有哪些卡片」 | 走 `get_page_data`（数据源 `widgets` / `available-widgets`），列出卡片与位置；**不发任何请求** |
| 14 | **AI·面板**：说「把版本信息卡片加上」 | `run_page_command(add-widget)` 直接执行（**不弹卡**）→ 卡片出现；重复要「只能有一张」的卡片时明确报错 |
| 15 | **AI·面板**：说「把概览卡片去掉」/「恢复默认布局」 | 前者按实例 id 移除、后者重置；两者都**先弹确认卡**，拒绝后不执行、不重试 |

## AI 助手（面板 / 全屏）

**代码**：`components/{ai-panel,ai-composer,ai-conversation,ai-conversation-scroller,ai-session-list,ai-session-picker,ai-activity-glow}.tsx` ·
`routes/$appId_.sphere/**`（全屏对话页）· `routes/_main/settings/AI.tsx`（设置）· 逻辑在 `lib/ai/**`、提示词在 `lib/ai/prompt/**`

**功能**
- **入口**：顶栏「Ask AI」（只在 `$appId` 外壳显示）；面板两种形态 —— **分屏**（挤压内容、可拖宽 300–720）与**浮窗**（可拖宽高、可折叠成只有头行的一条、移动端整屏）
- **最大化** → 全屏对话页 `/$appId/sphere`（没有应用侧边栏）；「收起」回到**最大化前的那一页**
- **会话**：新对话、会话列表（浮层 + 标题搜索 + 今天/昨天/7 天/30 天/更早分组）、删除（二次确认）；设置里的「刷新后新会话」决定刷新是否续上一段
- **输入区**：`Enter` 发送 / `Shift+Enter` 换行 / 输入法组字中的回车**不发送**；附件（图片 ≤4 MB、md/txt ≤256 KB、**一次最多 4 个**，图片与文本共用额度；被拦时走 toast）；`@` 引用模块 / 页面 / 记录；行首「+」菜单（添加照片和文件 / 引用位置 / 新对话）；模式 pill（**询问 / 自动**）；行尾设置菜单（只剩 **配置权限**——只有面板给，全屏对话页没有）
- **回答区**：Markdown（表格 / 代码块 / 链接新窗口）、**思考链折叠卡**（流式脉冲 → 完成态）、工具调用卡片（**默认隐藏**，设置可开）、本轮用量一行「缓存命中 / 输入 / 输出」（**与工具卡片同一个开关**）、任务清单卡（Todo）、**审批卡**、**跳转确认卡**、**全屏跳转建议卡**、「正在思考…」、输出方式（`wait` 一次性 / `stream` 流式）
- **滚动**：自动跟随（可关）；手动上翻临时暂停 + 浮出「回到底部」
- **进行中反馈**：视口四周呼吸光晕（设置可关；`prefers-reduced-motion` 下仍保留静态光）
- **设置 → AI**：**通用设置**（显示方式（分屏 / 浮窗）、会话时机、页面宽度、回答语言、是否显示详细信息（工具卡片 + 本轮 token 用量）、跟随滚动、**自动跳转**、进行中光晕、头像形状、输出方式）+ **AI 权限**（只读 / 完全访问 / 自定义逐项勾选；三档各有 tooltip 说明，工具分组说明挂在标题的 Info 图标上）。**厂商 / 模型配置已删除**（模型由 `apps/ai` 决定，前端不选模型）

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 顶栏点「Ask AI」 | 按设置打开分屏或浮窗；再点一次关闭（折叠态则先展开） |
| 2 | 分屏拖宽度 → 刷新 | 新宽度保留（300–720 之间） |
| 3 | 切浮窗 → 折叠 / 展开、拖宽高 | 折叠只剩头行；展开恢复上次尺寸；移动端整屏 |
| 4 | 点最大化 → 点「收起」 | 进全屏对话页；收起回到**最大化前那一页**（不是首页） |
| 5 | `Enter` / `Shift+Enter` / 中文输入法组字回车 | 发送 / 换行 / **不发送** |
| 6 | 一次加 5 个附件 | 只保留 4 个并弹 toast；超大图片被拦（图片 / 文件入口**始终可用**，不再按模型能力置灰） |
| 7 | 输入 `@user` | 引用面板出现；`↑↓` 换行、`Enter` 选中**不会误发消息**、`Esc` 收起 |
| 8 | 模式切「自动」后让它填表 | 填表不再确认；但通用写接口仍弹确认卡 |
| 9 | 面板齿轮 → 配置权限 → 改档 → 返回（不保存） | 不保存即丢弃；点保存才写入设置 |
| 10 | 运行中点停止 | 立即结束，已收到的内容保留，不报错 |
| 11 | 关掉「显示详细信息」 | 工具卡片与「缓存命中 / 输入 / 输出」那一行都不显示，但**审批卡、任务卡与「正在思考…」仍在** |
| 12 | 会话列表：新建 / 切换 / 搜索 / 删除 | 删除有二次确认；删掉当前会话后自动切到最近一条 |
| 13 | 全屏页刷新浏览器 | 会话仍在（IndexedDB），不会丢上下文 |
| 14 | 全屏对话页看输入区行尾 | **没有设置按钮**（「配置权限」只在面板给）；面板里也只有这一项 |
| 15 | 切 `ar-SA` | 面板/浮窗贴行首侧、浮动在行尾下角；整体 RTL 不错位 |

## 跨模块约定（测试时对照）

1. **权限 ≠ 模式**：AI 权限（默认**只读**）决定「**能不能用**这个工具」，模式（询问 / 自动）决定「用起来**要不要问**」—— 两维正交，别混着判断。只读档下 AI 应当如实回答"权限没开，去设置里调"，而不是说"我是询问模式所以不行"。
2. **跳转**：询问模式 → 面板三选一确认卡（带我去 / 本会话自动跳转 / 先不跳）；**自动模式直接跳**；全屏 → 建议卡（点卡片才跳）。选「本会话自动跳转」后同一对话内不再问，**刷新即失效**。
3. **写操作**：`call_write_api` 与页面指令里的 `write` 类**两个模式都要确认**；DELETE 类在卡片上标明「执行后无法撤销」；用户拒绝后 AI **不得重试同一条**。
4. **页面数据**：`get_page_data` 读的是页面 `feature.ts` 声明的数据源（面板模式**优先用它**，不要重复调接口）；**未迁移的页面返回 `data: []` + 一条改用接口的指路**；全屏容器不下发这个工具。
5. **页面指令**：`run_page_command` 执行的是**页面自己的处理函数**（含 toast、表格刷新），不是"再发一次请求"；`navigate` 类（打开表单 / 详情）直接执行、不弹卡。
6. **容器差异**：全屏容器**不下发** `update_search_params` / `get_page_data` / `run_page_command`（那里没有业务页面）；面板与全屏的**提示词策略不同**（面板先带路、全屏就地渲染）。
7. **范围闸**：与本系统/业务无关的请求（闲聊、通识、数学、写代码、解释代码、其它产品等）**一律拒绝且不调用任何工具**；例外只有**翻译**（系统多语言）与一句寒暄；分诊过程不输出给用户。细则见 [ai-architecture.md](./ai-architecture.md) §8。
8. **API Key**：**前端不再持有** —— 原先明文存本机 `admin.ai` 的厂商配置已删除，凭证由 `apps/ai` / AI Gateway 持有，任何日志 / toast / 错误都不回显。
9. **页面接入 AI 只有一份声明**：页面调一次 `useFeature(feature.ts)`（见 [features-architecture.md](./features-architecture.md)），
   由它统一喂给 `get_page_context`（描述 / 接口 / 表单 / 搜索参数）、`get_page_data`（数据源）、
   `run_page_command`（指令）、`open_form`（`openForm`）与写后刷新（`reload`）；
   **表单字段仍在表单组件里**用 `useAiFormFields` + 页面侧 `useAiFormSubmit`（同一个 `id` 拼成一条记录，这条没变）。
   测试时如果某个页面读不到数据/没有指令，先确认它是否已迁移 —— 迁移现状见
   [features-architecture.md](./features-architecture.md) §6（当前：users 已迁移，features / data-dict / home 未迁移）。

## system / 功能菜单树 · 功能详情（`$appId/system/features`）

**代码**：`routes/$appId/system/features/{route.tsx,index.tsx,$featureId.tsx,new.tsx}` ·
`-components/{feature-container.tsx,feature-detail.tsx,feature-form.tsx,feature-form-dialog.tsx,feature-permission-delete-dialog.tsx,feature-create-actions.tsx,feature-api-keys-field.tsx}` ·
`-data/{use-features-tree.ts,feature-options.ts,feature-columns.tsx,feature-apis.ts,feature-breadcrumb.ts,demo-features.ts}`

**三个落点**（模块根 `route.tsx` 是边界）
- **容器视图** `/$appId/system/features`：渲染新架构根节点（`MENU_ROOT_ID = 482`）的直接子项
- **节点视图** `/$appId/system/features/$featureId`：**同路由按 `menu_type` 分流** —— 功能组(1) → 容器视图（可继续嵌套）；功能(2) / 操作(3) → 详情视图
- **新建** `/$appId/system/features/new?pid=<父id>[&type=group|button]`：`pid` 绑定父级，缺省回落到根节点

**功能**
- 树表（搜索「命中节点 + 祖先链」、展开/折叠、统计随过滤变化）、逐级下钻、面包屑（`首页 / 系统 / 功能 / system / menus`，祖先可点回）
- **新建**功能组 / 功能 / 按钮（权限点）；行菜单新建子项 / 编辑 / 删除（删除有确认弹窗）
- **功能详情**：内嵌**草稿式可编辑表单**（改动后底部「未保存更改」浮条：保存 / 重置）、**状态开关**（`Switch`）、只读信息、**API Keys 字段**（候选项来自 `GET /api` 清单，显示成 `GET:/system/menu/tree`）、**权限点表格**（功能下的操作节点，可增删改）
- 功能组没有详情页——点功能组进的是容器视图，这是刻意的语义

**权限点**：代码里未做权限声明（模块注释提到权限点由 `menu_type=3` 的节点承载，属**业务数据**而非页面权限）

**接口**：`GET /system/menu/tree?menu_id=<id>`（按节点拉直接子项）· `POST /system/menu`（新建）·
`PUT /system/menu`（更新）· `DELETE /system/menu/{id}`（删除，连同下级）· `GET /api`（API Keys 候选项）

**AI 声明**：✅ **已接入**（三个页面各一份 `feature.ts`，页面一次 `useFeature`）
- **数据源** `feature-tree`（根视图 / 容器节点：这一层的功能行 —— menu_id / menu_name / menu_type /
  permission / route_name / path / status / visible / api_keys / children；本地搜索会改变这一份）
  与 `feature-node`（节点视图：当前节点 + 它的下级）—— 用户问「有哪些功能 / 某功能的权限标识是什么」
  时**直接读页面数据**，不用再拉树接口
- **数据源** `create-context`（新建页：这次挂在谁下面、是哪一类节点）
- **表单桥**：功能详情的 `fill_form` / `submit_form` **早就接好**（id = `feature-detail`，
  `canSubmit` 复用 `isDirty`，没改动直接拒绝）；**新建页的表单桥还没接**（下一步）
- ⚠️ **没有 `commands`**：增删入口的弹窗状态在 `feature-container.tsx` / `feature-detail.tsx` 内部，
  页面拿不到句柄（与数据字典同一条理由，补齐方式见 features-architecture.md §7）

### 测试清单

| # | 步骤 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/nivo/system/features` | 树表显示根节点（482）的直接子项 |
| 2 | 展开一个功能组 | 子项出现；可继续下钻，面包屑逐级更新且祖先可点 |
| 3 | 搜索一个功能名 | 只保留命中节点 + 祖先链；清空后回落折叠 |
| 4 | 点**功能组**的名字 | 进容器视图（**不是**详情页） |
| 5 | 点**功能**的名字 | 进详情：基本信息 + 权限点表格 |
| 6 | 新建（功能组 / 功能 / 按钮三种） | 父级绑定正确；`?pid` 缺省/非法时落到根节点 |
| 7 | 详情里改名称 → 保存 | 底部先出现「未保存更改」浮条；保存后 toast + 树里更新 |
| 8 | 详情里点「重置」 | 回到服务端值、浮条消失 |
| 9 | 权限点：在功能下新增 / 编辑 / 删除 | 生效并刷新表格；删除有确认弹窗 |
| 10 | 删除一个**有子项**的节点 | 确认后连同下级一起删除（或后端拒绝），列表随之更新 |
| 11 | API Keys 字段 | 候选项来自 `GET /api`；已选值显示成 `METHOD:/path` |
| 12 | **AI·面板**：在功能详情说「把名称改成 XXX」 | `fill_form` 写入字段（询问模式先确认）→ 输入框可见改动 |
| 13 | **AI·面板**：承上说「提交」 | `submit_form` → 确认卡 → 允许 → 保存成功；**没改动时直接拒绝、不弹卡** |
| 14 | **AI·面板**：`get_page_data` | 目前返回 `data: []` + 「改用接口」的指路（该模块**尚未迁移**） |
| 15 | 切 `ar-SA` | RTL 正常（树缩进、行尾操作列） |
| 16 | **AI·面板**：问「系统下有哪些功能 / 某某功能的权限标识」 | 走 `get_page_data`（`feature-tree` / `feature-node`），**不再调树接口**，与页面一致 |
| 17 | **AI·面板**：在功能详情说「把名称改成 XXX 并保存」 | `fill_form`（询问模式先确认）→ `submit_form` 审批卡 → 允许 → 保存成功；未改动时直接拒绝 |
| 18 | **AI·面板**：要求删除某个功能 | 该页**没有删除指令** → 模型应说明页面上怎么删，**不会静默调 `call_write_api` 绕过"输入名称确认"** |

## 维护这份清单

- **覆盖范围**：三个业务模块（users / system.features / system.data-dict / home）+ AI 助手 + 跨模块约定。
  新增页面时在对应模块下补一节（照 `users / 表格示例` 的格式）。
- **迁移一个模块时**：把该节的「AI 声明」从"尚未接入"改成实际的 `feature.ts` 能力
  （`commands` / `dataSources`），并更新 [features-architecture.md](./features-architecture.md) §6 的现状表。
- **测试清单的口径**：每条都要能照着点、且预期可观察（toast / 表格变化 / URL / 卡片）。
  新增测试时按模块编号往下排，**不要重排已有编号** —— 编号是回归记录的锚点。
