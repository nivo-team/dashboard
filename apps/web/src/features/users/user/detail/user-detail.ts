import { getUser } from '#/api'
import type { GetUserData, UserItem } from '#/api'
import { findDemoUser } from '../demo-users'

export interface UserDetailResult {
  /** 查询到的用户；为空表示未找到。 */
  user: UserItem | null
  /** 是否命中演示兜底数据。 */
  isDemo: boolean
  /** 请求异常信息（命中演示兜底时也会携带，便于界面给出提示）。 */
  error: string | null
}

/**
 * 加载单个用户详情。
 *
 * 取数顺序：GET /user 关键词查询 → 演示兜底数据。
 * 与列表页保持一致：后端不可用时仍可预览详情页结构。
 */
export async function fetchUserDetail(id: string): Promise<UserDetailResult> {
  const keyword = id.trim()

  try {
    const res = await getUser({
      query: {
        page: 1,
        page_size: 1,
        kw: keyword,
      } as GetUserData['query'],
    })

    const dataObj = res.data?.result
    const items = (dataObj?.items as UserItem[]) ?? []

    if (res.response && !res.response.ok) {
      const demo = findDemoUser(keyword)
      return { user: demo, isDemo: !!demo, error: res.data?.message ?? null }
    }

    if (items.length > 0) {
      return { user: items[0], isDemo: false, error: null }
    }

    const demo = findDemoUser(keyword)
    return { user: demo, isDemo: !!demo, error: null }
  } catch (err) {
    const demo = findDemoUser(keyword)
    return {
      user: demo,
      isDemo: !!demo,
      error: err instanceof Error ? err.message : null,
    }
  }
}
