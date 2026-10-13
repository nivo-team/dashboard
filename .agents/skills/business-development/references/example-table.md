---
name: business-development-example-table
description: 表格示例页（src/features/example/table/）的逐文件走读 —— 一个完整业务页的每个文件做什么、拆成模块化的理由、AI 页面声明怎么写。想照着完整一页实现时从 business-development 加载它。
---

# 表格示例页走读（references/example-table）

> 本文件是 [business-development](../SKILL.md) 的引用页。
> 读它的场合：**想照着完整的一页抄**，或想理解「为什么这页被拆成这么多文件」。

参考实现：`src/features/example/table/`（约 1900 行，11 个文件）。
它是最完整的一个业务页：**列表 + 详情 + 新建 + 编辑 + 表单 + AI 声明**，且
**没有批量接口之外的任何缺失**，可以作为模板逐文件对照。

> ⚠️ **它是示例，不是房子的默认形态。** 它刻意演示了一些**可选能力**
> （URL 搜索参数、演示兜底数据、CSV 导出、FilterBuilder 高级筛选）。
> 你的页面如果不需要这些，就不要抄对应的部分 —— 见 [SKILL.md §6](../SKILL.md)。
> 取数与查询状态的目标形态以 `src/features/roles/` 为准。

## 1. 文件清单与职责

| 文件 | 行数 | 做什么 | 要不要照抄 |
| --- | --- | --- | --- |
| `index.tsx` | 744 | **列表页总控**：`useCrudView` + `CrudViewport` + `TableControls` + `DataTable` + 删除弹窗 + 表单/详情插槽 | ✅ 结构照抄，裁剪掉演示部分 |
| `columns.tsx` | 24 | **列编排**（顺序即白名单）+ `DEFAULT_HIDDEN_COLUMNS` + `MIN_COLUMN_WIDTH` | ✅ 每页都需要 |
| `feature.ts` | 378 | **列表页对 AI 的全部声明**（工厂函数：指令 + 数据源 + 搜索参数 + 表单 + 接口） | ✅ 每页都需要，按需裁剪 |
| `form-view.tsx` | 255 | **纯表单组件**（弹窗 / 整页共用一份）+ `useAiFormFields` / `useAiFormSubmit` 表单桥 | ✅ 每页都需要 |
| `create-feature.ts` | 52 | 新建页（独立整页形态）的 AI 声明 | 有新建整页时需要 |
| `edit-feature.ts` | 59 | 编辑页（独立整页形态）的 AI 声明 | 有编辑整页时需要 |
| `detail-view.tsx` | 150 | **纯详情视图**（只读，不含外壳） | 需要详情时 |
| `detail-feature.ts` | 66 | 详情页的 AI 声明（只读页 → **没有 `commands`**） | 需要详情时 |
| `detail-loader.ts` | 54 | 详情取数（含演示兜底） | 简明取数可并入 view |
| `display.tsx` | 20 | 模块级共享小工具（时间戳格式化 hook） | 有共享逻辑时 |
| `demo-data.ts` | 80 | 演示兜底数据（接口不可用时预览用） | 示例特有，一般不需要 |

**为什么拆这么细**：一个文件一个职责 ——
「列编排」「表单」「详情呈现」「AI 声明」各自独立，改一处不牵动其它。
**不要**把 AI 声明塞进 `index.tsx`，也不要让表单组件内嵌 `PageHeader` / `LayerDialog`。

## 2. `index.tsx` 的骨架（列表页总控）

按顺序做六件事：

```tsx
const columnHelper = createColumnHelper<StockFeatures, UserItem>()

// ① URL 查询参数解析器（编译期校验字段名与类型，见 .agents/skills/business-development/references/table-query-and-crud.md）
const TABLE_EXAMPLE_FILTER_PARSERS = defineFilterParsers<GetExampleTableData['query']>()({
  id: parseAsInteger, nickname: parseAsString, email: parseAsString,
  createtime_min: parseAsInteger, createtime_max: parseAsInteger,
  // …
})

export function TableExampleListPage({ splat }: { splat?: string }) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })   // 命名空间 + 子前缀
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  // ② CRUD 视窗控制器：整页 / 弹窗 / 分屏 / 详情全由它调度
  const crud = useCrudView<UserItem>({
    basePath: `/${appId}/example/table`,
    splat,
    enableDetail: true,
    getFormMetadata: (mode, id) => { const m = getTableExampleFormMetadata(mode, t); return { ...m } },
    getDetailMetadata: (id) => ({ title: t('detail.title'), description: `${t('detail.fields.id')} ${id}` }),
  })

  // ③ 权限：按钮级判定，唯一的判定点
  const canCreate = useHasPermission('example:create')
  const canEdit   = useHasPermission('example:edit')
  const canDelete = useHasPermission('example:delete')

  // ④ 查询状态（URL 驱动）+ 本地 UI 状态（筛选弹窗草稿、选中行、列显隐…）
  const { queryParams, pagination, search, sorting: tableSorting, filters: tableFilters } =
    useTableQuery({ filterParsers: TABLE_EXAMPLE_FILTER_PARSERS, fields: USER_FILTER_FIELDS,
                    defaultPageSize: 15, defaultSortField: 'createtime', defaultSortOrder: 'desc' })
  const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
    'example/table', 'columnVisibility', () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
  )

  // ⑤ AI 页面声明：一次 useFeature，把 state 与处理函数交给工厂（每轮渲染重新登记）
  useFeature(createTableExampleListFeature({ rows, total, loading, demoMode, queryState, selectedIds,
    deleteOne, deleteMany, openCreateForm: crud.openCreate, openEditForm: crud.openEdit,
    openDetail: crud.openDetail, reload: fetchRows }))

  // ⑥ 渲染：CrudViewport 包住列表；表单与详情各一个插槽
  return (
    <div className="flex flex-col gap-4">
      <CrudViewport
        crud={crud}
        renderForm={(ctx) => <TableExampleFormSlot ctx={ctx} onSuccess={() => { ctx.close(); void fetchRows() }} />}
        renderDetail={(ctx) => <TableExampleDetailSlot id={ctx.id} />}
      >
        <PageHeader title={t('title')} description={t('description')} />
        <TableControls search={…} filters={…} activeFilters={…} table={table} actions={…} />
        <DataTable table={table} onRowClick={…} onBatchDelete={…} loading={…} error={…}
                   onRetry={fetchRows} moduleName={…} pagination={pagination} … />
        {/* 单项 / 批量删除的二次确认弹窗 */}
      </CrudViewport>
    </div>
  )
}
```

两个插槽组件放在同文件末尾，各做一件事：

```tsx
/** 统一表单插槽：内聚 AI Feature 挂载与业务表单交互 */
function TableExampleFormSlot({ ctx, onSuccess }: { ctx: CrudFormSlotProps<UserItem>; onSuccess: () => void }) {
  useFeature(ctx.mode === 'create' ? tableExampleCreateFeature : tableExampleEditFeature)
  return <TableExampleFormView formId={ctx.formId} mode={ctx.mode} userId={ctx.id}
                               initialData={ctx.initialData} hideActions={ctx.hideActions}
                               onSuccess={onSuccess} onClose={ctx.close} />
}

/** 统一详情插槽：内聚详情 AI Feature 挂载与数据反馈 */
function TableExampleDetailSlot({ id }: { id: string | number }) { /* 见 §4 */ }
```

**注意 `hideActions`**：弹窗形态由 `CrudFloatingContainer` 注入 `true`（底栏统一提交），
整页与分屏注入 `false`（表单自带按钮）—— 表单组件因此不用关心自己在哪。

## 3. `columns.tsx` 与 `form-view.tsx`

`columns.tsx` 只有 24 行 —— 这说明**列编排本身就该这么短**：声明顺序与渲染覆盖，
其余交给 `useSchemaColumns` 与 i18n。细节见 [table.md](./table.md) §2。

`form-view.tsx` 是**纯表单组件**的样板，两个关键点：

1. **只做字段与校验，不碰外壳**：`mode` / `initialData` / `hideActions` / `onSuccess` / `onClose`
   都由外部传入；标题与描述走导出的 `getTableExampleFormMetadata(mode, t)`，让各外壳（整页 / 弹窗）
   显示一致；
2. **原生注册 AI 表单桥**：

```tsx
const formBridgeId = isEdit
  ? `table-example-form-edit-${userId || initialData?.id || 'target'}`
  : 'table-example-form-create'

useAiFormFields({
  id: formBridgeId, title: meta.title, fields: aiFields,
  getValues: () => ({ nickname, email, avatar_url: avatarUrl }),
  setValues: (patch) => { /* 白名单：只放行声明过的字段 */ },
})

useAiFormSubmit({ id: formBridgeId, submit: submitAction, canSubmit: () => !submitting && !!nickname.trim() })
```

`useAiFormFields` / `useAiFormSubmit` 来自 `#/features/ai/core`。
**表单桥的 id 在编辑态带目标记录后缀**（`…-edit-10001`），因此 `feature.ts` 里声明的是
**逻辑 id**，AI 真要填表时以 `list_page_forms` 的返回为准。

> **表单校验的坑**：这个示例用「提交时提示必填」的就地校验。
> 详情页里的可编辑表单必须把校验抽成独立的 `validateXxxForm` 供两条路径共用 ——
> 见 [editable-detail.md](./editable-detail.md) 坑 1。

## 4. 详情页：纯视图 + 只读 feature

`detail-view.tsx` 是**纯数据呈现**，标题 / 返回按钮一律由外壳（`CrudViewContainer` / 分屏容器）渲染。
它通过 `onData` 把「已经加载好的记录」交回页面，页面再喂给 AI 数据源 —— 于是面板模式的 AI
回答「这个记录什么时候注册的」**不必再查接口**：

```tsx
// detail-view.tsx
export function TableExampleDetailView({ id, onData }: TableExampleDetailViewProps) { /* … */ }

// index.tsx 的插槽
function TableExampleDetailSlot({ id }: { id: string | number }) {
  const [detailUser, setDetailUser] = useState<UserItem | null>(null)
  useFeature(createTableExampleDetailFeature({ user: detailUser, loading, demoMode, id: String(id) }))
  return <TableExampleDetailView id={String(id)} onData={(u, meta) => { setDetailUser(u); /* … */ }} />
}
```

**只读页不要硬造指令**：`detail-feature.ts` 只有 `dataSources`、没有 `commands` ——
指令应当与页面上真实存在的入口一一对应（要编辑去列表页，那里有 `edit-record`）。

## 5. `feature.ts`：AI 页面声明怎么写

这是「一页一份 `feature.ts`」的完整样板（378 行，但每一段都有明确用途）：

```tsx
export function createTableExampleListFeature(options: TableExampleListFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '表格示例', description: '…', entities: ['记录', '昵称', '邮箱', …],
    permissions: ['example:read', 'example:create', 'example:edit', 'example:fill', 'example:submit', 'example:update', 'example:delete'],
    endpoints: [{ method: 'GET', path: '/example/table', permission: 'example:read', purpose: '…' }, /* … */],
    forms: [{ id, title, action, permission, fillPermission, submitPermission, fields, submission }],
    searchParams: { keywordParam: 'kw', paginationParams: ['page', 'page_size'], sortableFields, filterFields },
    commands: [ /* AI 能在这一页做什么 */ ],
    dataSources: [ /* 这一页现在有什么数据 */ ],
    reload: options.reload,
    openForm: ({ action, id, initialValues }) => { /* … */ },
  })
}
```

**必须是工厂函数，不是常量对象**：`commands[].run` 与 `dataSources[].read` 必须闭包
**页面此刻**的 state 与处理函数（当前这一屏记录、当前筛选、页面的删除实现）。
页面每轮渲染调一次 `createTableExampleListFeature({...})`，`useFeature` 把最新的一份登记进去 ——
于是 AI 读到的永远是用户正看着的那一屏，而不是首帧快照。

**指令的执行体必须是页面自己的函数**，不是「再调一次接口」：删除要发请求，还要 toast、
刷新表格、清空选中、关弹窗。早期让 AI 走通用 `call_write_api`，结果就是「库里删了、界面上还在」。

**`commands` 的两类**（`kind`）：

- `navigate`（打开表单 / 详情）→ **直接执行**，它只是把东西摆到用户面前，不替用户做决定；
- `write`（删除）→ **一律先过确认卡**，标 `destructive: true` + `approval: 'always'`，
  真正执行的是页面自己的处理函数。

**`dataSources` 的要点**：`state` 与数据同等重要 —— 没有它，模型分不清「这一屏」是第 3 页还是
搜索结果；`read()` 只做**投影**（只给表格真正展示的列），避免把整包原始对象塞进上下文；
字段注解里给敏感字段（`email`）标 `sensitive`，模型知道「有这个字段」但只看到掩码。

字段明细与页面目录登记见 `.agents/skills/business-development/references/features-architecture.md`。

## 6. 从这一页能学到的取舍

- **页面 `index.tsx` 是「总控」，不是「什么都在里面」** —— 列、表单、详情、AI 声明各自成文件；
- **`index.tsx` 里能读成一条直线**：视窗 → 权限 → 状态 → 声明 → 渲染；
- **外壳与内容永远分离**：表单 / 详情组件不知道自己在弹窗还是整页，`hideActions` 由视窗注入；
- **示例模块统一收在 `src/features/example/`**（`table` / `complex-table` / `tickets` / `tree-table`），
  路由在 `src/routes/$appId/example/`。**改示例时几个子模块一起看** ——
  它们共用 `example` 命名空间与 `example:*` 权限，任一处改命名要同步另几处。
