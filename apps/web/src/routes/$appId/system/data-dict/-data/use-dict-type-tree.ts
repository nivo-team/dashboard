import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { getDataDictTypeTreeQueryKey, getDataDictTypeTreeQueryOptions } from '#/api'
import { DICT_ROOT_TYPE_ID, findDictTypePath } from './data-dict-options'
import type { DictType } from './data-dict-types'

/**
 * 分类树的单一数据源（已按 `DICT_ROOT_TYPE_ID` 收窄范围）。
 *
 * 全模块只发一个请求：`GET /data_dict/type/tree`（**无任何参数**，一次返回整棵分类树）。
 * 与 features 最大的不同：features 靠 `?menu_id=` 让后端限定子树，这个接口不支持按节点过滤，
 * 因此**在本地把范围收窄**到 `DICT_ROOT_TYPE_ID`（67，架构升级期的新根）之下：
 *
 * - `nodes`：根分类的**直接子分类** —— 模块可见的最顶层，列表页就渲染这一层；
 * - `root`：根分类自身（用于详情页判定边界与统计）；
 * - 下钻、祖先链、树表子行全部从这棵子树派生，不会越出根的范围。
 *
 * ⏳ `DICT_ROOT_TYPE_ID` 的来历与删除条件见 `data-dict-options.ts`。
 *
 * ⚠️ 响应类型不可信：openapi 把该接口的 result 错声明为 `v1.DataOptions`（`{ options, total }`），
 * 实际是 `DictType[]`。这里在**唯一的取值点**做一次断言，其余地方全程类型安全
 * （见 `data-dict-types.ts` 的说明与 `⏳` 删除条件）。
 */
export function useDictTypeTree(rootTypeId: number = DICT_ROOT_TYPE_ID) {
  const query = useQuery(getDataDictTypeTreeQueryOptions())

  const allNodes = useMemo(
    // ⏳ 临时断言（删除条件见 `data-dict-types.ts`）：后端修正响应 schema 后可直接删掉
    () => (query.data?.result ?? []) as unknown as DictType[],
    [query.data],
  )

  /** 根分类自身；接口未返回该 id 时为 `undefined`（后端换了根或数据未就绪）。 */
  const root = useMemo(
    () => findDictTypePath(allNodes, rootTypeId).node,
    [allNodes, rootTypeId],
  )

  return {
    /** 根分类的直接子分类 —— 模块可见的最顶层。 */
    nodes: root?.children ?? [],
    /** 根分类自身。 */
    root,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * 失效整棵分类树缓存。
 *
 * 分类的新增 / 编辑 / 删除后调用：用不带参数的 `getDataDictTypeTreeQueryKey()` 作为前缀键，
 * 覆盖所有取值组合的缓存（该接口本身无参数，一次调用即全量失效）。
 */
export function useInvalidateDictTypeTree() {
  const queryClient = useQueryClient()

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: getDataDictTypeTreeQueryKey() }),
    [queryClient],
  )
}
