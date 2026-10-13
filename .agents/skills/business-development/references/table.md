---
name: business-development-table
description: 表格实现细节（DataTable + TanStack Table v9 + Kumo + 运行时 schema 生成列）。列编排、useSchemaColumns、筛选控制栏、列设置、树表、RTL 对齐与踩过的坑。加/改列表页时由 business-development 按需加载。
---

# 表格（references/table）

> 本文件是 [business-development](../SKILL.md) 的引用页。**入口先读那份** ——
> 它给的是「一页怎么搭起来」；这里是「表格这一块怎么填对」。
>
> 适用：`src/features/**` 下的列表页，以及 `src/components/data-table`、`src/components/table-controls`。
>
> **参考实现**：`src/features/example/table/`（逐文件走读见 [example-table.md](./example-table.md)）。

## 0. 数据来源：不重复定义数据模型

| 层 | 来源 | 手写？ |
| --- | --- | --- |
| 行数据类型 | `packages/api-client/src/generated/types.gen.ts`（`pnpm api` 生成，经 `#/api` 转发） | 否 |
| 运行时 schema | `packages/api-client/src/generated/schemas.gen.ts`（`@hey-api/schemas`，`XxxSchema` 常量） | 否 |
| 筛选字段目录 | `packages/api-client/src/query-params.gen.ts`（`scripts/gen-query-params.js`，`pnpm api` 已串） | 否 |
| 列编排 | 页面内 `Xxx_COLUMN_SPECS` / `DEFAULT_HIDDEN_COLUMNS` / `SORTABLE_FIELDS` | **是** |
| 列文案 | `src/messages/<ns>/<sourceLocale>.json` 的 `columns.*` | **是**（只写源语言） |

**禁止手写 interface 映射后端字段**；列定义必须绑定生成的类型与 schema。
API 变更后跑 `pnpm api` 重新生成，字段被删 / 改名会立即在 `typecheck` 暴露。

## 1. 列编排硬性规则

1. **一列只呈现一项数据**：一个字段一列。禁止「头像 + 昵称 + 手机号」这类复合单元格。
2. **嵌套对象展开为列**：`country` / `guild` / `extend` 的内部字段各自成列，
   用 `path` 指定取值路径（不要整块渲染对象）。
3. **数组字段用悬浮卡片**：单元格只显示摘要，hover/focus 展开完整列表 ——
   用 `#/components/array-hover-card` 的 `<ArrayHoverCard>`（`array` 内置渲染器已封装）。
4. **列宽**：数据列统一 `baseMeta: { headerClassName: MIN_COLUMN_WIDTH }`（`min-w-[120px]`）。
   仅头像、多选、操作等天然窄列例外。
5. **表头单行**：`DataTable` 已对 `Table.Head` 统一附加 `whitespace-nowrap` 与 `text-start`，
   不要再自行添加或使用物理 `text-left`。
6. **RTL 对齐**：一律逻辑属性。操作列写 `meta.sticky: 'right'`（语义是吸「行尾」）+
   `cellClassName: 'text-end'`，**不要**写物理 `text-right` / `text-left`。
7. **ID 永远排在第一列**：实体有 `id` / `uid` / `menu_id` 这类主键时，列编排的第一项就是它
   （`render: 'number'` 或 `'code'`），便于与后端数据对照、也方便排查。
8. **默认展示全部字段**：`DEFAULT_HIDDEN_COLUMNS` 默认为**空数组** ——「显示选项」是让用户
   按需临时收起的工具，不是设计上的默认收起项。确有必要时（如超长备注列）写进数组并注明理由
   （先例：`features/example/tickets/columns.tsx` 把 `description` 默认收起）。
9. **列 id 必须等于后端字段名**：排序时列 id 直接作为 `field` 参数发给后端，禁止驼峰改名
   （`wealth_lv` 不得写成 `wealthLevel`）。

## 2. 标准接入步骤

### 2.1 页面内声明编排

```tsx
import { UserItemSchema } from '#/api'
import { DataTable, useSchemaColumns } from '#/components/data-table'
import type { ColumnRenderer, SchemaColumnSpec } from '#/components/data-table'

const MIN_COLUMN_WIDTH = 'min-w-[120px]'

/** 默认隐藏列（列 id = 后端字段名）：默认**不隐藏**，仅在确有需要时填写 */
const DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

/** 可排序字段（列 id = 后端字段名） */
const SORTABLE_FIELDS = ['nickname', 'createtime', 'logintime'] as const

/** 列顺序即白名单；嵌套字段用 path；复杂展示用 render 指向自定义渲染器 */
const USER_COLUMN_SPECS: SchemaColumnSpec<UserItem>[] = [
  { field: 'id', render: 'code' },                          // ID 永远第一列
  { field: 'nickname', render: 'userName' },
  { field: 'account_types', render: 'roles' },              // 数组 → 悬浮卡片
  { field: 'guild', path: 'guild.name', render: 'guild' },  // 嵌套对象展开
  { field: 'freeze_gold', path: 'extend.freeze_gold', render: 'freeze' },
  'createtime',                                             // 按类型自动推断为 time
]
```

### 2.2 组装列

```tsx
const columnRenderers = useMemo<Record<string, ColumnRenderer<UserItem>>>(
  () => ({
    userName: ({ row }) => <button onClick={() => crud.openDetail(row.id!)}>{row.nickname}</button>,
    roles: ({ label, row }) => (
      <AccountTypesHoverCard title={label} accountTypes={row.account_types ?? []} />
    ),
  }),
  [crud],
)

const schemaColumns = useSchemaColumns<UserItem>(UserItemSchema, {
  ns: 'users',                                  // 列文案取 users:columns.<列 id>
  columns: USER_COLUMN_SPECS,
  sortable: SORTABLE_FIELDS,
  baseMeta: { headerClassName: MIN_COLUMN_WIDTH },
  renderers: columnRenderers,
})

const columns = useMemo(
  () => columnHelper.columns([selectColumn, avatarColumn, ...schemaColumns, actionsColumn]),
  [schemaColumns, /* … */],
)
```

> **多个页面共用一个命名空间时**，另给 `keyPrefix` 把各自的文案收在子键里：
>
> ```tsx
> // 文案落在 example:table.columns.<列 id>
> useSchemaColumns<UserItem>(UserItemSchema, {
>   ns: 'example',
>   keyPrefix: 'table',
>   columns: TABLE_EXAMPLE_COLUMN_SPECS,
>   // …
> })
> ```
>
> 传了 `keyPrefix` 后，该页所有 `t('columns.x')` 实际取的是 `example:table.columns.x` ——
> 补文案时别只写 `columns.x`。静态检查（`check-keys.mjs`）已按同一规则解析，
> 漏写前缀会在 `pnpm i18n:check-keys` 报「键不在 example/zh-CN.json」。

自定义列（多选 / 头像 / 操作）保持 `columnHelper.display(...)` 手写，其中操作列需
`meta: { sticky: 'right', cellClassName: 'text-end' }`、`enableHiding: false`。

`meta.sticky` 表达的是**逻辑侧**：`'right'` = 吸行尾（LTR 靠右、RTL 靠左）、`'left'` = 吸行首。
Kumo 的 `Table.Head` / `Table.Cell` 只接受物理 `left` / `right`，因此 `DataTable` 会按当前书写方向
（随 `useTranslation` 重渲染）解析成物理侧再下发。必须走 `meta.sticky`，不要在页面里直接给 Kumo
传物理方向 —— 只覆盖 `left/right` 会让 Kumo 生成的内侧渐变留在错误的一侧。

`columnVisibility` 初始值：`Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false]))`。
`sorting` 默认值里的 id 同样必须是字段名（如 `[{ id: 'createtime', desc: true }]`）。

### 2.3 补 i18n（唯一必须手写的文案）

`src/messages/<ns>/<sourceLocale>.json` 增加 `columns.<列 id>`（用了 `keyPrefix` 时是
`<ns>:<keyPrefix>.columns.<列 id>`）—— **只写源语言**，其余语言由 `pnpm i18n` 补齐
（见 [i18n-translation-pipeline.md](../../platform-ops/references/i18n-translation-pipeline.md)）。

**语言清单的真值只有 `i18n.config.json`**（`sourceLocale` + `targetLocales`）——
不在任何文档里列举有哪些语言，它变过，抄到别处必然过期。

缺文案时兜底为运行时 schema 的 `description` 首个分句，因此**不要在页面里硬编码中文 label**。

### 2.4 树形表格（父子层级，可选）

> 现有使用方：**数据字典分类树**（`src/features/data-dict/dict-type-table.tsx`）、
> **菜单树容器视图**（`src/features/menus/feature-container.tsx`）、
> **树形表格示例**（`src/features/example/tree-table/index.tsx`）。
> 展开态 hook 是 `#/components/data-table` 的 **`useTreeSearchExpanded`**；
> 过滤与计数纯函数在 `#/lib/tree-search`（`filterTreeByMatch` / `countTreeNodes`，
> UI 侧可从 `#/components/data-table` 一处导入）。三个模块共用同一套交互，照抄，不要再各写一份。

TanStack Table v9 的行模型工厂走 `features` 槽（不是 v8 的 table options），因此树表必须使用
`#/components/data-table` 导出的 `treeTableFeatures`（= `stockFeatures` + `expandedRowModel`）：

```tsx
// 访问器定义成模块级常量：过滤、展开与 useTable 共用同一份，引用才稳定
const SUB_ROWS = (row: Row) => row.children
const ROW_ID = (row: Row) => String(row.id)

// ① 本地搜索：只保留命中节点 + 其祖先链（命中节点只带命中的后代）
const filteredRows = useMemo(
  () =>
    keyword.trim()
      ? filterTreeByMatch(rows, (row) => matchesKeyword(row, keyword), {
          getSubRows: SUB_ROWS,
          withChildren: (row, children) => ({ ...row, children }),
        })
      : rows,
  [rows, keyword],
)

// ② 展开态：默认折叠 → 搜索时展开过滤结果 → 清空关键词回落折叠
const treeSearch = useTreeSearchExpanded<Row>({
  filteredNodes: filteredRows,
  keyword,
  getSubRows: SUB_ROWS,
  getRowId: ROW_ID,
})

const table = useTable({
  features: treeTableFeatures,                     // 不要用 stockFeatures
  data: pagedRows,
  columns,
  state: { columnVisibility, expanded: treeSearch.expanded },
  onExpandedChange: treeSearch.onExpandedChange,
  getRowId: ROW_ID,
  getSubRows: SUB_ROWS,
})

<DataTable table={table} tree />   {/* 层级缩进与展开控件固定在第一列，不需要指定列 id */}
```

- 传 `tree` 即开启树表：**第一列**（跳过多选列）由 `DataTable` 负责层级缩进与展开/折叠控件，
  页面**不要**自行渲染缩进，也不需要指定「哪一列是树列」—— 列顺序 / 显隐变了展开控件依然在最左；
- 子行视觉强调（`treeRowAccent`，默认开启）：子行（`depth > 0`）背景切到 `kumo-elevated`，
  并在树列左侧画一条 `border-s-2 border-kumo-brand` 竖线。竖线画在 `<td>` 的 border-box 上，
  高度天然铺满整行，**不要**再给它加圆角或伪元素偏移；写死背景色时必须同时改 `--kumo-table-row-bg`，
  否则 sticky 列会与整行背景错位；RTL 下用 `border-s-*` 逻辑属性，竖线自动改到右侧；
- 因为缩进落在第一列，**第一列要留够宽度**（`meta.headerClassName` 给到 `min-w-[160px]` 以上），
  避免深层级把内容挤出去；
- **搜索与展开一律走通用能力**，不要手写：
  - 过滤语义是「**只保留命中节点 + 其祖先链**」（命中节点的未匹配下级不出现）。想让命中节点
    连带整棵子树时，把 `withChildren` 改成回传完整 `getSubRows(row)` 即可 —— 但这是产品决策，改前先确认；
  - 展开语义是「默认折叠 → 搜索时按行 id 展开过滤结果 → 清空关键词回落折叠」，
    搜索期间用户仍可单独折叠某个分支（手动调整优先）；
  - ⚠️ **不要用 `expanded: true`**（v9 的「全部展开」特例在本仓库的 features 组合下**不会摊开子行**）；
    `state.expanded` 必须是 `{ [rowId]: true }` 映射 —— 通用 hook 已经按这个规则生成；
  - **关键词清空要回落折叠**，否则会留下一棵被上次搜索撑开的树；
- 树接口通常无分页/关键词参数：一次拉全量，搜索在前端完成。**统计口径分两种，不要混用**：
  - `quotaText`（「共 N 项」）用 `countTreeNodes(结果树, getSubRows)` —— **含所有层级**，
    与展开后的行数一致，且随搜索变化；
  - 分页 `total` 用**顶层项数**（切片发生在过滤之后），否则页数会算错；
  - 封装组件的 `quotaText` 支持**函数形态** `(total: number) => ReactNode`：过滤结果在组件内部、
    页面拿不到，由组件算好总数再回调（参考 `DictTypeTable` 与数据字典列表 / 详情页）；
- 客户端排序会打乱父子层级，树表**不要**开放列排序（不传 `sortable`）；分页作用于顶层节点
  （切片在过滤之后）。

### 2.5 查询控制栏（TableControls）

列表页统一用 `<TableControls>` 承载搜索、高级筛选、列设置与动作区，不要手写查询栏。

- **搜索**：`search.value` 受控，页面自己持有 state；`onSearch` 触发查询并 `setPage(1)`，
  `onClear` 清空关键词。默认宽度 `w-full sm:flex-1 max-w-xs`（窄屏占满整行、宽屏最长 320px），
  需要更宽/更窄用 `search.width` 或 `search.className` 覆盖；
- **高级筛选**：`filters` 只接收弹窗内容（`FilterBuilder` 的 props，展开给 `FilterBuilderPopover`
  的 children —— 见参考实现），筛选值仍由页面持有；`activeFilters` 展示生效条件的 chips；
- **搜索后置插槽**：`searchSuffix` 渲染在**主搜索框之后、「显示选项」之前**（主搜索框永远排在查询组
  第一位，不要把控件插到它左边），用于「一个紧凑下拉就能表达完」的筛选（如状态 1/2、类型枚举）。
  字段多、需要区间/多选时才用 `filters` 浮层；
- **枚举筛选的候选可以来自后端字典**：生成产物 `query-params.gen.ts` 里的 `options` 只有 value、
  也没有多语言。用 `<FilterBuilder resolveFieldOptions={...}>` + `#/lib/dict-options` 在运行时覆盖候选，
  并给 `describeFilterCondition()` 传第 4 个参数让已选条件的 chip 显示文案。
  **字典未就绪时必须返回 `undefined` 回退静态候选，不要返回空数组**（`??` 不对空数组回退，会得到空下拉）。
  详见 `.agents/skills/business-development/references/dict-options.md` 第 7.1 节；
- **动作区**：顺序固定为「刷新 → `afterRefresh` → 导入 / 导出 / 新增 / extra」。刷新是内置工具型操作，
  渲染在动作区最前，不需要页面自己拼按钮；`afterRefresh` 用于「新增 XX」这类主操作紧跟刷新
  （比 `extra` 更靠前的语义位置）；

  ```tsx
  <TableControls
    search={{ ... }}
    actions={{
      onRefresh: () => { void refetch() },   // 刷新当前页数据
      refreshLoading: isFetching,            // 按钮加载态
    }}
  />
  ```

- **布局**：行容器是 `flex flex-wrap`，动作区按断点分三档 —— `< sm`（640px）独占一整行并与查询组
  同侧起排（`basis-full justify-start`，`justify-start` 是逻辑方向，LTR 靠左、RTL 靠右）；
  `sm ~ lg` 与查询组同行紧跟其后；`≥ lg` 由左侧查询组的 `flex-1` 推到最右。不要再给动作区加 `ms-auto`；
  注意左侧组带 `min-w-0`（可收缩），空间不足时 Flexbox 会优先压缩它、而不是把动作区换行，
  因此小屏换行靠的是动作区的 `basis-full` 而非父级 `flex-wrap`；
- 按钮文案取 `common` 命名空间的 `table.actions.refresh`（各语言已就位），页面不必自带 `refreshTooltip` 这类专属文案。

**例外：简洁表格（详情页里的子表）** —— 如果只需要「统计文案 + 一个新增按钮」，
不要为了这个按钮挂整条 `TableControls`（它会一并带来搜索、筛选、列设置与刷新，反而把简单页面做重）。
改用 `DataTable` 的 `headerActions`，动作会渲染在卡片头部右侧、与统计文案同一行。
想「头部只留标题、统计放到卡片底部」时，用 `headerTitle`（取代统计文案的位置）+
`footer`（渲染在表格下方、分页栏上方）：

```tsx
<DataTable
  table={table}
  headerTitle="权限"
  footer={<>共 {rows.length} 项</>}
  headerActions={<Button variant="ghost" icon={<PlusIcon size={16} />} onClick={onCreate}>添加权限</Button>}
/>
```

`headerTitle` 与 `quotaText` 互斥（前者优先）；`footer` 不传则卡片没有尾部。
进入多选态后，多选控制器会另起一行，不会与 `headerActions` 挤在一起。

### 2.6 整行点击（onRowClick，可选）

点开详情时用 `DataTable` 的 `onRowClick`，**不要在列里自己挂 `onClick` 或写 `stopPropagation`**：

```tsx
<DataTable table={table} onRowClick={(row) => crud.openDetail(row.id!)} />
```

- 传入后整行可点：光标变手型、hover 有底色（hover 底色同步 `--kumo-table-row-bg`，
  吸列背景不会错位）；
- **自动忽略**来自行内交互元素（`button` / `a` / `input` / `select` / `textarea` / `label` /
  `[role="button"|"menuitem"|"checkbox"|"switch"]`）的点击与**文本拖选**；
  需要额外豁免时给元素加 `data-row-click-ignore`；
- 不会把行变成可聚焦控件（那会破坏 table 语义），键盘用户走行内原有的详情入口；
- 行点击通常与名称按钮 / 头像 / 行内菜单共用一个打开函数，内部再按「详情打开方式」偏好分流
  （分屏 / 抽屉 / 跳转）—— 在 CrudView 架构下这个函数就是 `crud.openDetail(id)`，
  见 [.agents/skills/business-development/references/detail-preview.md](./detail-preview.md)。

### 2.7 分组表头（多级表头，可选）

用 `columnHelper.group({ columns: [...] })` 把字段归类，`DataTable` 会按 TanStack 的
`getHeaderGroups()` 逐行渲染，跨格（`colSpan` / `rowSpan`）由它统一负责，
**页面不要自己管 `colSpan` / `rowSpan`**。

两条推论：

- 分组表头**不要**给 `meta.headerClassName` 传 `min-w-*`：宽度由组内叶子列决定，
  给分组加最小宽会把分组撑得比它的列还宽；
- 分组表头与树表可以叠加；若分组内包含树列，树列仍是**第一个可见数据列**，缩进与展开控件落在它上面。

⚠️ **本仓目前没有任何页面使用分组表头**（`example/complex-table` 是刻意做的**单层表头宽表**，
不是分组表头 —— 见该文件注释）。`DataTable` 侧对 `colSpan` 与 `rowSpan === 0` 的处理是照
TanStack 官方约定实现的（跳过 `rowSpan === 0` 的格，否则整行分组标题会左移、表头下划线中途断掉），
但**没有实测页面**。要用它请先自测，跑通后回来补一个参考实现。

## 3. 渲染器

内置（`render` 可省略，按 schema 类型推断）：`text`、`code`（等宽）、`number`、`money`、
`time`（自动按全局时区格式化，秒/毫秒自适应）、`boolean`（真值判定 `true`/`1`）、
`array`（自动 `ArrayHoverCard`）。

推断规则（`inferRenderKind`，按顺序）：

1. `type === 'array'` → `array`；`type === 'boolean'` → `boolean`；
2. `integer / number / string` 之间：
   - 字段名匹配 `/(time|_at|date|_day)$/i` → **`time`**（优先于金额）；
   - 非字符串且匹配 `/(price|amount|balance|money|fee|cost)/i` → **`money`**；
   - 其余：字符串 → `text`，数字 → `number`；
3. 兜底 → `text`。

自定义渲染器签名：

```ts
type ColumnRenderer<TData> = (ctx: {
  value: unknown          // 已按 path 取值
  row: TData
  label: string           // i18n 后的列名，可直接给悬浮卡片当标题
  t: TFunction
  formatNumber: (n: number) => string
  formatDateTime: (v: unknown) => string
  empty: string
  itemRender?: (v: unknown, i: number) => ReactNode
}) => ReactNode
```

自定义渲染器的 key 与内置名同名时会**全局覆盖**该内置渲染器（`rendererMap = { ...defaults, ...renderers }`），
所以不要拿 `text` / `number` 这类名字当自定义 key。

需要自定义的典型场景：枚举徽章（`account_types` → `AccountTypesHoverCard`）、状态开关
（`agent` 是 1=是，`freeze_*` 是 2=是，两种约定不同，不要复用同一个渲染器）、带图标的金额、
等级 `Lv.x`、需要回退取值的字段（`country_name || country.country_name`）。
可复制的机器串用 `#/components/copyable-value`（`CopyableValue`）。

## 4. 常见坑

- **`$ref` 嵌套必须写 `path`**：`country` / `guild` / `extend` 在响应里是对象，schema 只能给出 `$ref`，
  推断不出行数据路径；整块字段不要放进 `columns`（会渲染成空串）。
- **schema 的属性顺序不可靠**：列顺序必须由 `columns` 白名单显式给出，未列出的字段不会成列。
- **`schemas.gen.ts` 体积大**：只 import 用到的 schema 常量，未引用部分会被 tree-shaking 移除。
- **数组枚举需要翻译**：`account_types` 这类值为 `anchor` / `merchant` 等英文枚举，
  必须在渲染器里映射 i18n，默认渲染器只显示原始值。
- **枚举徽章变体只能取 Kumo `Badge` 的合法集合**：
  `primary | secondary | error | warning | success | info | outline | beta`。
  写 `neutral` / `danger` / `green` 这类不在集合里的名字会被**静默忽略**（先查官方 registry 再写）。
- **演示兜底**：后端不可用时的 demo 数据放模块内（`example/table/demo-data.ts` 是现成写法）。
- **空态与错误**：`DataTable` 已接管 loading / error / empty / 分页，页面只需传
  `loading`、`error`、`onRetry`、`pagination`。`loading` 只在**当前无行**时显示加载行。
- **分页栏按卡片自身宽度自适应，不要改回固定分栏**：分页栏声明了命名容器 `@container/pagination`，
  根节点带 `flex-wrap justify-center gap-y-3`，统计信息与「每页条数」包在同一个 `flex-wrap` 分组里 ——
  卡片被侧栏 / 分屏挤窄时整条栏自动换行且**每行居中**；只有容器 ≥720px 时翻页控件才
  `@min-[720px]/pagination:ms-auto` 贴行尾。页面不要给 `Pagination` 传 `className`，
  也不要把 `ms-auto` 改回无条件生效。
- **行分隔线由 `DataTable` 提供，不要自行改造行底色**：Kumo 的 `Table` 只在表头输出
  `[&_th]:border-b`，body 行本来靠斑马纹区分；`DataTable` 为了单元格内容更干净，已在 `Table.Body`
  上取消斑马纹并补出 `[&>tr>td]:border-b border-kumo-fill`（最后一行去掉边框以匹配分页栏的 `border-t`）。
  在单元格 / 行上覆盖背景或边框类之前，先确认不会把行分隔线一起盖掉。
- **表格容器（`LayerCard.Primary`）必须整体直角**：`DataTable` 内已固定为 `rounded-none`。
  Kumo 的 `LayerCard.Primary` 自带 `rounded-lg`，同时是 `overflow-x-auto` 的裁剪容器；
  而 `rounded-t-none` 与 `rounded-lg` 不是同一组类，`twMerge` **不会**移除 `rounded-lg`，
  底部圆角依然在，于是贴底的表格最后一行被裁出圆弧 —— 树表子行的背景与左侧 `kumo-brand` 竖线
  正好落在最后一行时，竖线末端会被裁圆、看起来没铺满行高。卡片外轮廓的圆角由外层 `LayerCard`
  的 `overflow-hidden rounded-lg` 负责，内层不需要重复。
- **接口无分页时的临时方案**：`DataTable` 的分页控件是受控的（只回调、不切片），接口还没分页时
  在页面里 `slice((page-1)*pageSize, page*pageSize)` 传给它，并对 `filteredTotal / pageSize`
  做一次页码收敛（`page > maxPage` 时 `setPage(maxPage)`），否则搜索或刷新后容易停在空白页。
  搜索、筛选的 handler 里都要 `setPage(1)`。

## 5. 验收清单

表格的验收清单已并入 **`verify` skill**（第 5 节「表格」），本文件不再重复维护。

**不要在开发过程中主动跑 `pnpm typecheck` / `pnpm build` / 浏览器验收** —— 只有使用者点名 `verify` 时才执行。
