import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Updater } from '@tanstack/react-table'
import type { SortingState } from '#/components/data-table'
import type { QueryFilterField } from '#/api'
import type { FilterCondition } from '#/components/table-controls'
import { useAiSearchParamsUpdater } from '#/features/ai/core/search-params-bridge'
import { filterConditionsToQueryPatch, queryToFilterConditions } from './filter-sync'
import type { FilterParserConstraint } from './types'

/**
 * 解析后的查询状态（标准参数 + 各列表声明的筛选字段）。
 */
type ParsedQueryState = {
  page: number
  page_size: number
  kw: string
  field: string
  order: 'asc' | 'desc'
} & Record<string, unknown>

export interface UseTableQueryOptions<
  TQuery extends Record<string, any>,
  TFilterParsers extends FilterParserConstraint<TQuery>,
> {
  /** 筛选参数解析器映射（通过 defineFilterParsers 声明） */
  filterParsers: TFilterParsers
  /** 可选字段目录（传入后自动与 FilterBuilder 联动） */
  fields?: readonly QueryFilterField[]
  /** 默认页码，默认 1 */
  defaultPage?: number
  /** 默认每页条数，默认 15 */
  defaultPageSize?: number
  /** 默认排序列名 */
  defaultSortField?: string
  /** 默认排序方向 */
  defaultSortOrder?: 'asc' | 'desc'
}

export function useTableQuery<
  TQuery extends Record<string, any>,
  TFilterParsers extends FilterParserConstraint<TQuery>,
>(options: UseTableQueryOptions<TQuery, TFilterParsers>) {
  const {
    filterParsers,
    fields = [],
    defaultPage = 1,
    defaultPageSize = 15,
    defaultSortField = 'createtime',
    defaultSortOrder = 'desc',
  } = options

  // 1. 组装标准 primary/pagination 与业务自定义 filter parsers
  const parsers = useMemo(
    () => ({
      page: parseAsInteger.withDefault(defaultPage),
      page_size: parseAsInteger.withDefault(defaultPageSize),
      kw: parseAsString.withDefault(''),
      field: parseAsString.withDefault(defaultSortField),
      order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault(defaultSortOrder),
      ...filterParsers,
    }),
    [defaultPage, defaultPageSize, defaultSortField, defaultSortOrder, filterParsers],
  )

  /*
    `FilterParserConstraint` 用**可选属性**（`?`）表达「只声明一部分筛选字段」
    （见 `defineFilterParsers`），于是 `TFilterParsers` 在约束位置带 `| undefined`；
    而 nuqs 的 `useQueryStates` 入参要求 `{ [x: string]: KeyMapValue<any> }`，不接受 undefined。

    运行时对象展开不会产生 undefined 值，所以入参断言只影响类型检查、不改变行为。
    但断言之后 nuqs 无法再推断返回类型 —— 若不显式标注，`rawQuery` 会退化成 `any`，
    并把「没有类型保护」一路传到 `queryParams`（那才是真正喂给 API 的东西）。
    因此这里把解析结果写成 `ParsedQueryState`。
  */
  const [rawQuery, setRawQuery] = useQueryStates(
    parsers as unknown as Parameters<typeof useQueryStates>[0],
    {
      history: 'replace',
      shallow: false,
      clearOnDefault: true,
    },
  ) as unknown as [ParsedQueryState, (patch: Record<string, unknown>) => void]

  // 注册让 AI 能够直接更新当前表格的搜索与筛选参数
  useAiSearchParamsUpdater(
    useCallback(
      (patch) => {
        setRawQuery(patch)
      },
      [setRawQuery],
    ),
  )

  // 2. 构造干净的 API queryParams（剔除 null、undefined 与空字符串）
  const queryParams = useMemo(() => {
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rawQuery)) {
      if (value !== null && value !== undefined && value !== '') {
        clean[key] = value
      }
    }
    return clean as TQuery
  }, [rawQuery])

  // 3. 排序状态（TanStack Table SortingState 适配）
  const sorting = useMemo<SortingState>(() => {
    if (!rawQuery.field) return []
    return [{ id: rawQuery.field, desc: rawQuery.order === 'desc' }]
  }, [rawQuery.field, rawQuery.order])

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      if (!first) {
        setRawQuery({ field: null, order: null, page: 1 })
      } else {
        setRawQuery({
          field: first.id,
          order: first.desc ? 'desc' : 'asc',
          page: 1,
        })
      }
    },
    [sorting, setRawQuery],
  )

  // 4. 主搜索词受控状态与触发控制
  const [searchInput, setSearchInput] = useState(rawQuery.kw)
  useEffect(() => {
    setSearchInput(rawQuery.kw)
  }, [rawQuery.kw])

  const onSearch = useCallback(
    (customVal?: string) => {
      const kw = (customVal !== undefined ? customVal : searchInput).trim()
      setRawQuery({ kw: kw || null, page: 1 })
    },
    [searchInput, setRawQuery],
  )

  const onClear = useCallback(() => {
    setSearchInput('')
    setRawQuery({ kw: null, page: 1 })
  }, [setRawQuery])

  // 5. 分页控制器
  const onPageChange = useCallback(
    (page: number) => {
      setRawQuery({ page })
    },
    [setRawQuery],
  )

  const onPageSizeChange = useCallback(
    (pageSize: number) => {
      setRawQuery({ page_size: pageSize, page: 1 })
    },
    [setRawQuery],
  )

  // 6. 筛选器条件双向同步
  const filterKeys = useMemo(() => Object.keys(filterParsers), [filterParsers])

  const appliedFilters = useMemo(
    () => queryToFilterConditions(rawQuery, fields),
    [rawQuery, fields],
  )

  const onApplyFilters = useCallback(
    (draft: FilterCondition[]) => {
      const patch = filterConditionsToQueryPatch(draft, fields, filterKeys)
      setRawQuery({ ...patch, page: 1 })
    },
    [fields, filterKeys, setRawQuery],
  )

  const onClearFilters = useCallback(() => {
    const patch: Record<string, null> = {}
    for (const k of filterKeys) patch[k] = null
    setRawQuery({ ...patch, page: 1 })
  }, [filterKeys, setRawQuery])

  const onRemoveFilter = useCallback(
    (conditionId: string) => {
      const updated = appliedFilters.filter((c) => c.id !== conditionId)
      const patch = filterConditionsToQueryPatch(updated, fields, filterKeys)
      setRawQuery({ ...patch, page: 1 })
    },
    [appliedFilters, fields, filterKeys, setRawQuery],
  )

  return {
    /** 纯净的、供 API Client / TanStack Query 直接调用的强类型查询参数 */
    queryParams,
    /** 分页控制状态与回调 */
    pagination: {
      page: rawQuery.page,
      pageSize: rawQuery.page_size,
      onPageChange,
      onPageSizeChange,
    },
    /** 搜索框控制状态与回调 */
    search: {
      value: searchInput,
      onChange: setSearchInput,
      onSearch,
      onClear,
    },
    /** 排序状态与回调 */
    sorting: {
      sorting,
      onSortingChange,
    },
    /** 筛选器联动状态与回调 */
    filters: {
      appliedFilters,
      onApplyFilters,
      onClearFilters,
      onRemoveFilter,
    },
    /** 底层原始 state 与 setter */
    rawQuery,
    setRawQuery,
  }
}
