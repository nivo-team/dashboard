import { getExampleTable } from '#/api'
import type { GetExampleTableData, UserItem } from '#/api'
import { findDemoTableExampleRow } from './demo-data'

export interface TableExampleDetailResult {
  /** 查询到的记录；为空表示未找到。 */
  user: UserItem | null
  /** 是否命中演示兜底数据。 */
  isDemo: boolean
  /** 请求异常信息（命中演示兜底时也会携带，便于界面给出提示）。 */
  error: string | null
}

/**
 * 加载单个表格示例详情。
 *
 * 取数顺序：GET /user 关键词查询 → 演示兜底数据。
 * 与列表页保持一致：后端不可用时仍可预览详情页结构。
 */
export async function fetchTableExampleDetail(id: string): Promise<TableExampleDetailResult> {
  const keyword = id.trim()

  try {
    const res = await getExampleTable({
      query: {
        page: 1,
        page_size: 1,
        kw: keyword,
      } as GetExampleTableData['query'],
    })

    const dataObj = res.data?.result
    const items = (dataObj?.items as UserItem[]) ?? []

    if (res.response && !res.response.ok) {
      const demo = findDemoTableExampleRow(keyword)
      return { user: demo, isDemo: !!demo, error: res.data?.message ?? null }
    }

    if (items.length > 0) {
      return { user: items[0], isDemo: false, error: null }
    }

    const demo = findDemoTableExampleRow(keyword)
    return { user: demo, isDemo: !!demo, error: null }
  } catch (err) {
    const demo = findDemoTableExampleRow(keyword)
    return {
      user: demo,
      isDemo: !!demo,
      error: err instanceof Error ? err.message : null,
    }
  }
}
