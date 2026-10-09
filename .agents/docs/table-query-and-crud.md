# 表格 URL 搜索参数与 CRUD 开发规范

> 适用范围：所有后台数据列表页（`users`, `data-dict` 等）、`TableControls` 搜索控制栏、Mock API 增删改查实现。
> 核心原则：**查询驱动状态进 URL（nuqs 驱动 + 编译期类型严格检查）、纯 UI 偏好进 Zustand 持久化、接口定义即 OpenAPI 契约、CRUD 具备完整单项与批量能力。**

---

## 1. 状态存储职责边界

| 状态类型 | 典型字段 | 存储宿主 | 理由 | 行为特征 |
| --- | --- | --- | --- | --- |
| **查询驱动状态** | 搜索词 `kw`、页码 `page`、每页条数 `page_size`、排序字段 `field`、排序方向 `order`、各类筛选项 | **URL Query String**（通过 `nuqs`） | **可分享、可收藏、支持浏览器前进后退** | 默认值自动从 URL 清除（`clearOnDefault: true`）；切应用时自然随路由更新 |
| **本机视觉偏好** | 列显隐 `columnVisibility`、扩展显示选项 `otherVisibility` | **Zustand**（`admin.table-ui:<appId>`） | 本机操作习惯，无需在不同用户分享链接时覆盖对方的列视图 | 按 App 作用域隔离；多标签页同步 |
| **临时操作态** | 当前选中行 `rowSelection`、筛选弹窗草稿 `filterDraft`、加载中 `loading` | **组件内存 State** (`useState`) | 随当前交互生灭，不落盘亦不污染 URL | 刷新或切出即复位 |

---

## 2. 类型安全 Query 参数设计与类型函数

业务代码禁止手写 loose 的 `Record<string, unknown>` 或手动 `as GetXxxData['query']` 断言，必须通过编译期类型工具完成校验。

### 2.1 类型工具库 (`src/lib/list-query/types.ts`)

```ts
import type { ParserBuilder, SingleParser } from 'nuqs'

/** 标准分页参数名 */
export type StandardPaginationKeys = 'page' | 'page_size'

/** 标准主查询与排序参数名 */
export type StandardPrimaryKeys =
  | 'kw'
  | 'field'
  | 'order'
  | 'time_field'
  | 'range_time'

/**
 * 从完整 API Query 类型中提取纯筛选字段（过滤掉 primary 和分页参数）
 */
export type FilterParamsOf<
  TQuery,
  CustomPrimary extends keyof NonNullable<TQuery> = never,
  CustomPagination extends keyof NonNullable<TQuery> = never,
> = Omit<
  NonNullable<TQuery>,
  StandardPaginationKeys | StandardPrimaryKeys | CustomPrimary | CustomPagination
>

/**
 * 提取主参数（kw、排序等）
 */
export type PrimaryParamsOf<
  TQuery,
  CustomPrimary extends keyof NonNullable<TQuery> = never,
> = Pick<
  NonNullable<TQuery>,
  Extract<keyof NonNullable<TQuery>, StandardPrimaryKeys | CustomPrimary>
>

/**
 * 提取分页参数
 */
export type PaginationParamsOf<
  TQuery,
  CustomPagination extends keyof NonNullable<TQuery> = never,
> = Pick<
  NonNullable<TQuery>,
  Extract<keyof NonNullable<TQuery>, StandardPaginationKeys | CustomPagination>
>

/**
 * 将字段值类型 V 映射到对应的 nuqs Parser 类型约束
 */
export type QueryFieldParser<V> =
  [NonNullable<V>] extends [boolean]
    ? SingleParser<boolean> | ParserBuilder<any, boolean>
    : [NonNullable<V>] extends [number]
      ? SingleParser<number> | ParserBuilder<any, number>
/**
 * 字段值类型 V 对应的 nuqs SingleParserBuilder 约束
 */
export type QueryFieldParser<V> = SingleParserBuilder<NonNullable<V>>

/**
 * 筛选器 Parser 映射基线约束类型
 */
export type FilterParserConstraint<TQuery> = {
  [K in keyof FilterParamsOf<TQuery>]?: QueryFieldParser<FilterParamsOf<TQuery>[K]>
}
```

### 2.2 辅助构建函数与编译期拦截（柯里化工厂模式）

```ts
/**
 * 声明筛选器 Parser 映射（强类型校验 + 避免 defaultValue 类型擦除）
 */
export function defineFilterParsers<TQuery>() {
  return function declareParsers<P extends FilterParserConstraint<TQuery>>(
    parsers: P & Record<Exclude<keyof P, keyof FilterParamsOf<TQuery>>, never>,
  ): P {
    return parsers
  }
}
```

**编译期保护效果**：
1. **拼写错误拦截**：传入不存在的字段名，TS 报错 `Type '...' is not assignable to type 'never'`；
2. **类型不匹配拦截**：例如将数字字段 `id` 配置为 `parseAsString`，TS 报错 `Type 'SingleParserBuilder<string>' is not assignable to type 'SingleParserBuilder<number>'`；
3. **保留非空推导**：不擦除 `.withDefault()` 生成的默认值标记，API query 类型推导依然精确。

---

## 3. 通用 Hook：`useTableQuery`

封装基础的 `useQueryStates`，对分页、关键词、排序和业务过滤项进行统一管理：

```ts
export interface UseTableQueryOptions<TQuery, TFilterParsers> {
  defaultPage?: number
  defaultPageSize?: number
  sortableFields?: readonly string[]
  defaultSort?: { field: string; order: 'asc' | 'desc' }
  filterParsers: TFilterParsers
}

export function useTableQuery<
  TQuery extends Record<string, any>,
  TFilterParsers extends FilterParserConfig<TQuery>,
>(options: UseTableQueryOptions<TQuery, TFilterParsers>) {
  // 1. 组装标准 primary 与 pagination parsers
  // 2. 结合 filterParsers 传入 useQueryStates
  // 3. 返回：
  //    - queryParams: 供 TanStack Query / API SDK 直接消费的强类型对象
  //    - pagination: { page, pageSize, setPage, setPageSize }
  //    - search: { keyword, setKeyword, triggerSearch, clearSearch }
  //    - sorting: { sortingState, setSortingState }
  //    - filters: { activeFilters, setFilter, removeFilter, resetFilters }
}
```

### 3.1 AI 搜索参数桥与自动化过滤 (`update_search_params`)

- `useTableQuery` 在组件挂载时，会自动调用 `useAiSearchParamsUpdater(setRawQuery)` 将自身的参数调度器注册至搜索参数桥；
- 页面通过 `definePageCapabilities` 声明 `searchParams`（含 `keywordParam`, `sortableFields`, `paginationParams`, `filterFields`）；
- AI 可调用 `update_search_params` 工具直接更新 URL 中的搜索词、高级过滤项、排序与分页，前端表格与控制栏实时无缝联动；
- 该工具归入 `read` 权限等级，用户提问时无需弹窗审批，即时执行生效。

---

## 4. Mock 服务扩展规范（用户 CRUD）

在 `apps/mock` 中实现用户模块完整的增删改查闭环。契约由 Mock 的 `defineRouteMeta` 反向生成。

### 4.1 接口契约一览

| 方法 | 路径 | 描述 | 请求参数 / Body | 响应结果 |
| --- | --- | --- | --- | --- |
| `GET` | `/user` | 用户分页列表 | Query: `page`, `page_size`, `kw`, `field`, `order`, `id`, `nickname`, `email`, `createtime_min`, `createtime_max`, `logintime_min`, `logintime_max` | `{ code: 0, result: { total, items: UserItem[] } }` |
| `GET` | `/user/{id}` | 用户单条详情 | Path: `id` | `{ code: 0, result: UserItem }` |
| `POST` | `/user` | 新建用户 | Body: `{ nickname: string, email?: string, avatar_url?: string }` | `{ code: 0, result: UserItem }` |
| `PUT` | `/user` | 编辑用户 | Body: `{ id: number, nickname?: string, email?: string, avatar_url?: string }` | `{ code: 0, result: UserItem }` |
| `DELETE` | `/user/{id}` | 单项删除用户 | Path: `id` | `{ code: 0, result: null }` |
| `POST` | `/user/batch-delete`| 批量删除用户 | Body: `{ ids: number[] }` | `{ code: 0, result: { deleted_count: number } }` |

### 4.2 数据层与冒烟要求

1. **`server/utils/db.ts`**：
   - `seq.user` 起始计数设为 `20000`；
   - 支持内存可变写入：新增后在列表立即可见，修改即刻生效，删除彻底移除；
2. **冒烟测试 (`apps/mock/scripts/smoke.mjs`)**：
   - 必须包含完整的写操作闭环：`创建用户 -> 查看详情 -> 列表校验 -> 更新用户信息 -> 校验更新 -> 批量创建 -> 批量删除`；
   - 保证退出码为 0。

---

## 5. 前端列表页与系统组件补全规范

### 5.1 数据表格联动

1. **多选与批量删除工具栏**：
   - 表格多选开启（`selectColumn`）；
   - 当 `table.getSelectedRowModel().rows.length > 0` 时，在控制栏或卡片头部呼出批量操作条（如：`已选 3 项`，带 `DangerConfirmDialog` 的「批量删除」按钮）；
   - 批量删除成功后自动清空 `rowSelection`，并调用 `queryClient.invalidateQueries` 刷新列表。
2. **服务端排序联动**：
   - `manualSorting: true`；
   - 表头排序点击直接更新 URL 的 `field` 与 `order`，并触发 `setPage(1)`；
3. **创建与编辑弹窗**：
   - 点击「新增用户」打开创建 Dialog（Kumo 弹窗规范）；
   - 行操作菜单「编辑」打开编辑 Dialog；
   - 成功后自动调用 API 客户端失效缓存并通过 `appToastManager` 提示。

### 5.2 契约与构建保证

- 修改 Mock 路由后，运行 `pnpm contract && pnpm api` 生成最新 SDK 与 Query 钩子；
- 遵循铁律：用户可见文案**只写源语言 `zh-CN`**，其它语言由 `pnpm i18n` 流水线补齐
  （目标语言清单以 `i18n.config.json` 的 `targetLocales` 为准，当前为 `ar-SA`）；
- 严禁在日常提交过程中主动运行 `pnpm verify`。
