import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getDataDictQueryKey, getDataDictQueryOptions } from '#/api'
import type { DictItemPage } from './data-dict-types'

/** 字典项列表的查询参数。 */
export interface DictItemsQuery {
  /** 所属分类；缺省（`undefined`）时不带 `type_id`，返回全部分类的项。 */
  typeId?: number
  /** 关键词（服务端过滤）。 */
  keyword?: string
  /** 状态：1 启用 / 2 禁用；缺省不筛。 */
  status?: number
  page: number
  pageSize: number
  /**
   * 是否发起请求（默认 true）。
   *
   * 用于「删除分类前查一次该项下有没有字典项」这类**按需触发**的查询：
   * 弹窗打开时才需要，关闭状态下传 false 即可避免常驻请求。
   */
  enabled?: boolean
}

/** 字典项列表的返回体（已兜住后端 `items` 缺失的情况）。 */
const EMPTY_PAGE: DictItemPage = { total: 0, items: [] }

/**
 * 字典项的分页列表（**服务端分页**）。
 *
 * 与分类树是**两个独立数据源**：分类树是全量单请求，这里是按 `type_id` 过滤的分页查询，
 * 因此本模块不能照搬 features 的「单棵树本地派生 + 本地切片」。
 *
 * queryKey 由生成的 `getDataDictQueryKey({ query })` 决定（含全部查询参数），
 * 因此换分类 / 翻页 / 改关键词都会各自命中独立缓存。
 *
 * ⚠️ 响应类型不可信：openapi 把该接口的 result 错声明为 `v1.DataOptions`（`{ options, total }`），
 * 实际是 `{ total, items }`（实测 `total: 187`）。同样是**唯一取值点**做断言。
 */
export function useDictItems(params: DictItemsQuery) {
  const { enabled = true } = params

  const queryOptions = getDataDictQueryOptions({
    query: {
      type_id: params.typeId,
      kw: params.keyword ? params.keyword : undefined,
      status: params.status,
      page: params.page,
      page_size: params.pageSize,
    },
  })

  const query = useQuery({ ...queryOptions, enabled })

  // ⏳ 临时断言（删除条件见 `data-dict-types.ts`）：后端修正响应 schema 后可直接删掉
  const page = (query.data?.result ?? EMPTY_PAGE) as unknown as DictItemPage

  return {
    items: page.items ?? [],
    total: page.total ?? 0,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * 失效字典项列表缓存。
 *
 * 字典项的新增 / 编辑 / 删除后调用。用不带参数的 `getDataDictQueryKey()` 作为前缀键：
 * 生成的 key 第一段是 `{ _id: 'getDataDict', baseUrl }`，TanStack Query 的前缀匹配会忽略
 * 实际查询里的 `query: {...}`，因此一次调用即可覆盖所有分类 / 页码 / 关键词的缓存组合。
 */
export function useInvalidateDictItems() {
  const queryClient = useQueryClient()

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: getDataDictQueryKey() }),
    [queryClient],
  )
}
