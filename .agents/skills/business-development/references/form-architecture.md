# 表单架构与人机协同规范（Form Architecture & AI Co-working）

> 适用范围：所有后台新增、编辑与查看类表单组件、独立表单与详情路由、以及 AI 表单自动化填报交互。
> 核心原则：**表单纯组件单一真值、Splat 路由单文件极薄化、URL 始终第一真值、支持弹窗/分屏/整页自适应调度、AI 表单桥双向闭环。**

---

## 1. 核心架构与设计哲学

传统后台常为弹窗写一套 Form、为分屏写一套 Form、为独立页面又写一套 Page，导致字段验证与业务逻辑三处分叉，且衍生出大量的 Wrapper 胶水文件（`create-page.tsx`, `edit-page.tsx`, `form-dialog.tsx` 等）。

本项目确立全新的 Single-Route + Unified CrudView 分层架构：

```
                    ┌────────────────────────────────────────────────────────┐
                    │               路由层：直接一个 $.tsx 文件              │
                    │   - 捕获 _splat: '' | 'new' | ':id' | ':id/edit'       │
                    │   - 配合 matchCrudSplat 在 beforeLoad 集中做权限守卫   │
                    └───────────────────────────┬────────────────────────────┘
                                                │ 传入 splat 参数
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             单文件管理入口 (features/xxx/index.tsx)                                 │
│                                                                                                    │
│   ┌────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────────────┐   │
│   │   列表 (Table)     │   │   纯表单 (FormView)       │   │   纯详情 (DetailView)             │   │
│   │   纯数据与列配置   │   │   纯字段、校验规则与 AI 桥    │   │   纯数据呈现与只读结构            │   │
│   └─────────┬──────────┘   └─────────────┬─────────────┘   └─────────────────┬─────────────────┘   │
│             │                            │                                   │                     │
│             └────────────────────────────┼───────────────────────────────────┘                     │
│                                          ▼                                                         │
│                   通用视窗控制器 (useCrudView + CrudViewContainer / CrudFloatingContainer)        │
│     - URL 绝对第一真值 (Path 驱动独立整页，Query 驱动列表浮层)                                     │
│     - 用户偏好仅在主动事件点击时生效 (formOpenMode / detailOpenMode: dialog | split | sheet | page) │
│     - 移动端自动降级 (<768px 自动降级为 page)                                                      │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 五项强制规范

### 2.1 规范一：表单纯组件单一真值（Pure Single Component）
- 任何实体对象的表单视图**全局只编写一个组件**（例如 `TableExampleFormView`、`TicketFormView`）；
- **彻底剥离外壳**：表单组件内部**绝不内嵌** `PageHeader`、`LayerDialog` 或 `useDetailPreview`，组件 props 不含 `variant`；
- 标题（title）与描述（description）一律由承载它的当前外壳（`CrudViewContainer` 或 `CrudFloatingContainer`）统一渲染；
- 模块导出标准化的元数据函数（如 `getTableExampleFormMetadata(mode, t)`），保证各外壳展示的标题与描述完全一致；
- 接收外部传入的 `formId?: string`，并支持 `hideActions?: boolean`（在 Dialog 中由 Dialog 底部 Actions 提交，在整页/分屏中自带底部操作条）。

### 2.2 规范二：Splat 单文件极薄路由规范（Splat Single Route File）
- 模块子路径统一由 TanStack Router 的 Splat 路由 `$.tsx` 捕获，配合薄列表 `index.tsx`：
  - `routes/$appId/.../$.tsx`：单文件捕获 `new`、`:id`、`:id/edit` 等全部子路由；
  - `routes/$appId/.../index.tsx`：列表根路径薄入口；
- **彻底淘汰冗余胶水文件**：严禁创建平行的 `create-page.tsx`、`edit-page.tsx`、`detail-page.tsx`、`form-dialog.tsx` 等胶水包装层；
- 在 `$.tsx` 的 `beforeLoad` 中通过 `matchCrudSplat` 集中做权限守卫：
  ```tsx
  export const Route = createFileRoute('/$appId/example/table/$')({
    beforeLoad: async ({ params, location }) => {
      const match = matchCrudSplat(params._splat, { enableDetail: true })
      if (!match) throw notFound()

      const permission =
        match.type === 'create'
          ? 'example:create'
          : match.type === 'edit'
            ? 'example:edit'
            : undefined

      await guardRoutePermission({
        appId: params.appId,
        permission,
        href: location.href,
      })
    },
    component: TableExampleSplatRoute,
  })

  function TableExampleSplatRoute() {
    const { _splat } = Route.useParams()
    return <TableExampleListPage splat={_splat} />
  }
  ```

### 2.3 规范三：URL 绝对第一真值法则（URL as Source of Truth）
URL 是页面展现形态与状态的唯一权威依据，**所有 ID、表单状态与视窗形态全部在 URL 中保存**：

| 当前 URL 状态 | 最终呈现形态 | 列表背景行为 | 状态说明 |
| :--- | :--- | :--- | :--- |
| **Path**: `/table/new` 或 `/:id/edit` 或 `/:id` | **Page 整页沉浸** | **完全不渲染**（跳过列表取数与 DOM，极致性能） | 独立整页模式；未匹配的非法路径直接触发 404 Not Found |
| **Query**: `?type=create` | **Dialog 模态弹窗新建** | **正常渲染列表** | 新建表单（无 ID） |
| **Query**: `?type=create&view=split` | **Split 分屏新建** | **正常渲染列表** | 右侧协同分屏新建 |
| **Query**: `?id=:id&type=edit` | **Dialog 模态弹窗编辑** | **正常渲染列表** | 编辑指定 ID 的表单 |
| **Query**: `?id=:id&type=edit&view=maximized` | **Dialog 90% 最大化全屏** | **正常渲染列表** | 弹窗就地扩大至 90% 视口全屏输入 |
| **Query**: `?id=:id&type=detail` | **Sheet 抽屉详情** | **正常渲染列表** | 查看指定 ID 的详情 |
| **Query**: `?id=:id&type=detail&view=split` | **Split 分屏详情** | **正常渲染列表** | 右侧并列分屏查看详情 |
| **Path**: `/table` (无参数) | **List 标准列表** | 正常渲染列表 | 根列表 |

> **关键规则**：
> 1. **全状态持久化**：链接完整携带 `id`、`type` 与 `view`，刷新或分享能够 100% 还原当时的表单类型、记录对象与弹窗尺寸形态；
> 2. **保护路径约束**：`/table/new` 与 `/table/edit` 为受保护保留路径，孤立的 `/edit` 缺少 ID 或未找到记录直接触发 `notFound()` 组件，绝不静默回退；
> 3. **关闭即清空**：点击关闭或取消时，URL Query 自动完全清空，视图精准回到纯净列表。

### 2.4 规范四：用户偏好仅在主动触发时生效
用户本地偏好（`formOpenMode` / `detailOpenMode`）**仅在发生主动事件时作为默认策略**：
1. **用户主动点击**（点击工具栏“新建”、点击表格行“编辑”、点击表格行“查看”）；
2. **AI 主动调用**（`openCreateForm`、`openEditForm`、`openDetail`）。

分流逻辑：
- **移动端视口（`< 768px`）**：主动事件**一律降级为跳转 Path**（如 `/${appId}/example/table/new`），避免小屏幕上弹窗或分屏挤压变形；
- **桌面端视口**：
  - 偏好为 `page` $\rightarrow$ 跳转 Path（`/${appId}/example/table/new`）；
  - 偏好为 `dialog` / `split` $\rightarrow$ 叠加 Query（`?type=create` 或 `?id=123&type=edit`）；
  - 偏好为 `sheet` / `split` $\rightarrow$ 叠加 Query（`?id=123&type=detail`）。

### 2.5 规范五：原生注册 AI 表单桥（AI Form Bridge）
表单组件挂载时，必须在组件内部通过 `useAiFormFields` 与 `useAiFormSubmit` 注册自己：
1. **字段清单**：暴露真实字段名、Label、字段控件类型；
2. **读写闭包**：提供 `getValues` 与 `setValues`，AI 写入时只放行表单声明过的白名单字段；
3. **提交闭包**：提供 `submit` 与 `canSubmit`，当字段校验不通过或正在提交时如实反馈给 AI。

---

## 3. 标准化单文件管理模板 (`features/xxx/index.tsx`)

所有业务模块的增删改查视图由 `features/xxx/index.tsx` 单文件集中编排调度：

```tsx
export function MyModulePage({ splat }: { splat?: string }) {
  const { t } = useTranslation('my-module')
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  // 1. 统一由 useCrudView 接管视窗与路由状态
  const crud = useCrudView<MyItem>({
    basePath: `/${appId}/example/my-module`,
    splat,
    enableDetail: true,
    getFormMetadata: (mode, id) => getMyFormMetadata(mode, t),
    getDetailMetadata: (id) => ({ title: `详情 #${id}` }),
  })

  // 2. 整页沉浸态 (URL Path 触发)：不加载列表数据，直接渲染带 PageHeader 的全屏组件
  if (crud.isPageMode) {
    return (
      <CrudViewContainer crud={crud}>
        {crud.activeView.type === 'page-form' ? (
          <MyFormView
            formId={crud.formId}
            mode={crud.activeView.mode}
            itemId={crud.activeView.id}
            initialData={crud.formInitialData}
            onSuccess={crud.close}
            onClose={crud.close}
          />
        ) : (
          <MyDetailView id={String(crud.activeView.id)} />
        )}
      </CrudViewContainer>
    )
  }

  // 3. 列表态：渲染 DataTable 并由 CrudFloatingContainer 统一处理 Dialog/Split/Sheet 浮层
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('title')} />
      <TableControls ... />
      <DataTable
        table={table}
        onRowClick={(item) => crud.openDetail(item.id)}
      />

      <CrudFloatingContainer
        crud={crud}
        renderForm={(ctx) => (
          <MyFormView
            formId={ctx.formId}
            mode={ctx.mode}
            itemId={ctx.id}
            initialData={ctx.initialData}
            hideActions={ctx.hideActions}
            onSuccess={() => {
              ctx.close()
              void fetchRows()
            }}
            onClose={ctx.close}
          />
        )}
        renderDetail={(ctx) => <MyDetailView id={String(ctx.id)} />}
      />
    </div>
  )
}
```

---

## 4. 人机协同（AI 自动填表闭环）

AI 填报操作由四个原子工具串联完成：

```
       ┌──────────────────────┐
       │   用户自然语言指令    │
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 1.    │      open_form       │  AI 呼出目标表单（更新 URL / 唤起弹窗或分屏）
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 2.    │   list_page_forms    │  AI 读取当前挂载表单的字段结构与现存值
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 3.    │      fill_form       │  AI 将提取出的键值写入受控表单，前端界面实时回显
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 4.    │     submit_form      │  请求用户确认卡片，确认后触发表单验证并提交入库
       └──────────────────────┘
```

1. **`open_form`**：接收 `action: 'create' | 'edit'`、可选 `id` 与可选 `values`（一步完成打开与预填），对接 `crud.openCreate` 与 `crud.openEdit`；
2. **`list_page_forms`**：从表单桥读取当前活跃表单信息，杜绝 AI 凭空臆测字段名；
3. **`fill_form`**：通过 `setValues` 闭包安全更新组件 State，受白名单保护；
4. **`submit_form`**：触发组件的保存链路。审批由 `features/ai/core/approval-policy.ts` 的策略表决定 —— `ask` 下弹卡、**`auto` 下免问**（由表单自己的 `canSubmit()` 把关）。表单显式写 `requireApproval: true` 才会在两个模式下都强制确认。
