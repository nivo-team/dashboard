---
name: business-development
description: 本仓库业务页面开发的唯一入口（列表 / 表格 / 表单 / 详情 / CRUD 视窗 / 权限 / i18n / AI 页面声明 / 薄路由 / 仪表盘卡片 / 角色菜单字典等系统模块）。新增或修改 src/features 与 routes 下的业务页面时先加载它；细节按需读 references/ 下那 14 份。
---

# 业务开发（business-development）

**这是本仓库「业务页面怎么写」的单一入口。** 列表页、表格、表单、详情、CRUD 视窗、
权限、i18n、AI 页面声明、薄路由 —— 都在这里给出**骨架与去处**，深度内容在 `references/`。

> 为什么聚合：以前 `table-development` 与 `editable-detail` 各自成篇，
> 结果是「加一个列表页」要同时读两份、还容易漏掉 `feature.ts` 与路由。
> 现在只有一个入口，细节做成引用，按任务取用；原在 `.agents/docs/` 的模块规范也一并收了进来。

## 0. 先读哪份

| 你要做什么 | 读 |
| --- | --- |
| **加一个业务页 / 改列表页 / 改 CRUD 视窗 / 改薄路由** | 本文件（看完就有骨架） |
| 列编排、`useSchemaColumns`、筛选控制栏、列设置、树表、表格样式与坑 | [references/table.md](./references/table.md) |
| 详情页内嵌表单、保存浮条、页头状态开关、草稿 / dirty / 重置 | [references/editable-detail.md](./references/editable-detail.md) |
| 想照着**完整的一页**抄（含 AI 声明、demo 兜底、纯表单 / 纯详情拆分） | [references/example-table.md](./references/example-table.md) |
| 表格 URL 搜索参数与增删改查（nuqs、类型函数、Mock 契约） | [references/table-query-and-crud.md](./references/table-query-and-crud.md) |
| 表单三态自适应与 AI 表单桥 | [references/form-architecture.md](./references/form-architecture.md) |
| 页面声明框架（`defineFeature` / `useFeature`）的字段明细 | [references/features-architecture.md](./references/features-architecture.md) |
| 权限判定、守卫、按钮级收口 | [references/permissions-architecture.md](./references/permissions-architecture.md) |
| 列表点行看详情（分屏 / 抽屉） | [references/detail-preview.md](./references/detail-preview.md) |
| 加仪表盘卡片 / 改栅格 | [references/dashboard-module.md](./references/dashboard-module.md) |
| 菜单管理 / 角色管理模块 | [references/features-module.md](./references/features-module.md) |
| 数据字典分类模块 | [references/data-dict-module.md](./references/data-dict-module.md) |
| 字典多语言文案库 / 字典驱动下拉 | [references/dict-i18n.md](./references/dict-i18n.md) · [references/dict-options.md](./references/dict-options.md) |
| 功能说明与**回归测试清单**（按模块，照着一节一节点） | [references/features-catalog.md](./references/features-catalog.md) |

**不要一次全读**：`references/` 现在有 14 份、合计约 200 KB，按上面这张表取。

> 底座类内容（路由、store、样式、API 客户端、登录）**不在本 skill** —— 去
> [../platform-development/SKILL.md](../platform-development/SKILL.md)。
> 页面里的 AI 声明归这里，但 AI 自身（提示词 / 工具 / 中间层）去
> [../ai-development/SKILL.md](../ai-development/SKILL.md)。

## 1. 一个业务页长什么样

铁律（见 `AGENTS.md`）：**路由文件只做「路径 → 组件」的薄适配，业务一律在 `src/features/**`**，
一个业务一个扁平目录，**一页一份 `feature.ts`**。

```
src/routes/$appId/system/roles/          ← 路由层：只留守卫 / 取参 / 渲染
  route.tsx                               模块根：guardRoutePermission('<m>:read') + <Outlet />
  index.tsx                               createFileRoute(...)({ component: RoleListPage })
  $.tsx                                   Splat：matchCrudSplat + 写权限守卫 + 旧路径重定向

src/features/roles/                      ← 业务层：一页一目录
  index.tsx                               列表页总控（useCrudView + CrudViewport 单文件编排）
  list/feature.ts                         列表页对 AI 的声明（工厂函数）
  detail/index.tsx  detail/feature.ts     详情页（可编辑详情见 references/editable-detail.md）
  role-form.tsx                           纯表单组件（弹窗 / 整页共用一份）
```

**视窗调度是统一的**：列表、新建、编辑、详情四态不再各写一份包装，
统一交给 `#/components/crud`：

- `useCrudView({ basePath, splat, enableDetail, getFormMetadata, getDetailMetadata })`
  —— URL 是第一真值：`?id=&type=edit|detail&view=` 驱动浮层，Path `/new`、`/:id/edit` 驱动整页；
- `<CrudViewport crud={crud} renderForm={...} renderDetail={...}>` —— **只声明一次**，
  自动覆盖整页 / 弹窗 / 分屏三态；进入整页态时**自动阻断列表渲染与取数**。

**不要再写** `create-page.tsx` / `edit-page.tsx` / `detail-page.tsx` / `form-dialog.tsx`
这类平行胶水层 —— 它们在 Single-Route + CrudView 架构里已被淘汰。

## 2. 列表页骨架（照抄即可）

```tsx
export function RoleListPage({ splat }: { splat?: string }) {
  const { t } = useTranslation('roles')
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  // ① 视窗控制器：整页 / 弹窗 / 分屏 / 详情全由它调度
  const crud = useCrudView<RoleItem>({
    basePath: `/${appId}/system/roles`,
    splat,
    enableDetail: true,
    getFormMetadata: (mode, id) => getRoleFormMetadata(mode, t, id),
    getDetailMetadata: (id) => ({ title: t('title'), description: `ID ${id}` }),
  })

  // ② 取数 / 查询状态 / 列 / 权限（细节见 references/table.md 与 §3）
  const { queryParams, pagination, search, sorting, filters } = useTableQuery({ /* … */ })
  const columns = useSchemaColumns<RoleItem>(RoleItemSchema, { /* … */ })

  // ③ 校验：整行点击、删除等页面动作走 crud / 自己的处理函数
  const table = useTable({ features: stockFeatures, data: rows, columns, /* … */ })

  // ④ AI 页面声明：一次 useFeature，把 state 与处理函数交给工厂
  useFeature(createRoleListFeature({ rows, total, loading, queryState: queryParams, reload }))

  return (
    <div className="flex flex-col gap-4">
      <CrudViewport
        crud={crud}
        renderForm={(ctx) => <RoleFormSlot ctx={ctx} onSuccess={() => { ctx.close(); void reload() }} />}
        renderDetail={(ctx) => <RoleDetailPage id={String(ctx.id)} />}
      >
        <PageHeader title={t('title')} />
        <TableControls search={...} filters={...} table={table} actions={...} />
        <DataTable
          table={table}
          onRowClick={(row) => crud.openDetail(row.id)}
          loading={query.isPending}
          error={errorMsg}
          onRetry={reload}
          moduleName={t('moduleName')}
          pagination={pagination}
        />
      </CrudViewport>
    </div>
  )
}
```

要点：**列表内容作为 `CrudViewport` 的 children**；表单与详情各声明一个插槽函数；
`renderForm` / `renderDetail` 里拿到的 `ctx` 带 `mode` / `id` / `formId` / `hideActions` / `close`。

## 3. 端到端步骤（加一个业务页）

1. **接口先行**：改 Mock 路由 → `pnpm contract && pnpm api` 生成 SDK / 类型 / schema / Query 钩子
   （见 `apps/mock/README.md`、`packages/api-client/README.md`）。**不要手写 interface 映射后端字段。**
2. **建目录**：`src/features/<模块>/`，一页一目录、扁平；
   页面入口 `index.tsx`，跨页共用件用语义化文件名平铺（`columns.tsx` / `form-view.tsx`）。
3. **写 `feature.ts`**：`createXxxFeature(options)` → `defineFeature({...})`，
   把 `title / description / entities / endpoints / permissions` 与 `commands` / `dataSources` / `reload`
   写全 —— **页面里只留一次 `useFeature(...)`**。指令的执行体必须是页面自己的函数
   （删除要顺带 toast、刷新、清选中），不是「再调一次接口」。
4. **薄路由**：`index.tsx`（列表）+ `$.tsx`（Splat，`matchCrudSplat` + `guardRoutePermission`）+ 模块根 `route.tsx`。
5. **权限**：读权限在模块根路由 `/ 列表路由` 的 `beforeLoad` 用 `guardRoutePermission`；
   按钮 / 行内操作用 `useHasPermission('<模块>:<动作>')`。**没有权限的行内动作整列不渲染。**
6. **i18n**：只写 `apps/web/src/messages/<ns>/<sourceLocale>.json`（源语言见 `i18n.config.json`），
   其它语言由 `pnpm i18n` 补齐。表格列文案取 `columns.<列 id>`，代码里用 `#/lib/use-typed-t` 的 `useT('ns')`。
7. **接导航**：只动 `src/lib/navigation.ts`（**不要在渲染处再硬编码一份平行名单**）。
8. **登记页面目录**：`src/features/ai/core/page-catalog.ts` 的 `AI_PAGE_CATALOG` 补一条
   `{ path, title, desc, endpoints }` —— 否则 AI 的 `search_pages` 检索不到它。`path` 与导航项逐字一致。

校验命令（`typecheck` / `build` / 浏览器验收）**默认不跑**，只有使用者点名 `verify` 时才执行。

## 4. 抄哪一页

| 场景 | 参考实现 |
| --- | --- |
| **标准 CRUD 列表 + 详情 + 表单（最完整的一页）** | `src/features/example/table/` —— 逐文件走读见 [references/example-table.md](./references/example-table.md) |
| 复杂表格：宽表 / 分组表头 / 展开行 / 汇总 / 多字段筛选 | `src/features/example/complex-table/` |
| 树形表格（父子层级 + 搜索联动展开） | `src/features/example/tree-table/`、`src/features/data-dict/dict-type-table.tsx` |
| 没有批量接口、需要 AI 编排逐条执行的 CRUD | `src/features/example/tickets/` |
| 可编辑详情（内嵌表单 + 保存浮条 + 页头开关） | `src/features/roles/detail/`、`src/features/data-dict/detail/` |

## 5. 本仓库特有的红线（违反即为返工）

1. **不要手写平行的表单 / 详情包装** —— 用 `useCrudView` + `CrudViewport` 的单一插槽。
2. **表单组件全局只有一份**：弹窗与详情页复用同一个组件，字段与校验不分叉。
3. **文案只写源语言**（`i18n.config.json` 的 `sourceLocale`），**不要手写其它语言**，
   也不要在文档 / 注释里列举语言清单。
4. **样式**：禁用 `dark:` / `tracking-*` / `font-bold`；颜色只用 Kumo 语义令牌；
   链接统一用 `#/components/router-link`（`RouterLink`）。
5. **给模型的内容都必须经过函数并留过滤点**（提示词 / 导航清单 / 表单清单 / 页面接口），过滤条件集中在一处。
6. **危险操作二次确认**用 `#/components/danger-confirm-dialog`（必须原样输入确认文本）。

## 6. 现状差异（照抄前先看一眼）

本仓正处于从「手写弹窗状态 + 局部 useState」向 **Single-Route + CrudView + URL 第一真值**迁移的中途，
新旧写法并存，抄之前认清哪份是目标形态：

- **取数**：`roles` / `data-dict` / `menus` 已用生成的 TanStack Query 选项
  （`getXxxQueryOptions` + `useMutation` + 生成的 queryKey 失效）——**这是目标形态**；
  `example/table` / `example/tickets` 的**列表**仍用 `useState` + 异步函数 + `useEffect`
  手写取数（因为它们要内置「接口不可用时的演示兜底数据」），照抄时按需裁剪。
- **查询状态**：`useTableQuery`（URL 驱动 + AI 搜索参数桥）是新列表页的标准，
  `example/table` / `example/tickets` / `example/complex-table` 已用；
  `roles` / `menus` 仍是局部 `useState`（存量，迁移时替换）。
- **删除确认**：目标形态是通用件 `DangerConfirmDialog`（`roles` / `data-dict` / `menus` 已用）；
  `example/*` 用的是就地 `LayerDialog.Alert`，那是示例的简化写法。

## 7. 维护本 skill

- 表格规范只在 [references/table.md](./references/table.md) 维护；详情页规范只在
  [references/editable-detail.md](./references/editable-detail.md) 维护 —— **不要在别处再抄一份**。
- 新增通用能力（新的内置渲染器、控制栏能力、CRUD 视窗选项）时，同步更新本文件与对应 reference，
  并顺带核对 §6 的现状表是否还成立。
- `AGENTS.md` 只保留指向本 skill 的一行；细节写到这里，别塞进 `AGENTS.md`。
