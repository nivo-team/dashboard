import { updatePageSearchParams } from '../search-params-bridge'
import type { AiToolDefinition } from '../types'

/**
 * 页面搜索与筛选参数更新工具。
 *
 * 归入 read 等级：更新搜索参数仅驱动前端视图检索与过滤，不产生任何后端写操作，
 * 只读模式与询问模式下均可直接执行，无需打扰用户。
 */
export const updateSearchParamsTool: AiToolDefinition = {
  name: 'update_search_params',
  catalogDescription: '修改当前页面的筛选条件',
  description:
    '更新当前页面的搜索与筛选参数（关键词、多字段筛选、服务端排序、分页）；参数值设为 null 可清除该参数。',
  inputSchema: {
    type: 'object',
    properties: {
      params: {
        type: 'object',
        description:
          '要更新的查询参数键值对。例如 {"kw": "张三"}、{"page": 2}、{"field": "createtime", "order": "asc"}、{"email": "test@example.com"}。传 null 表示移除该参数。',
        additionalProperties: true,
      },
      resetOthers: {
        type: 'boolean',
        description:
          '可选：是否在应用新参数时清空当前其它已生效的筛选参数（用于「重新搜索」、「清空所有筛选」等场景）',
      },
    },
    required: ['params'],
    additionalProperties: false,
  },
  access: 'read',
  group: 'page',
  execute: async (input, ctx) => {
    const rawParams = (input as { params?: Record<string, unknown> }).params ?? {}
    const resetOthers = Boolean((input as { resetOthers?: boolean }).resetOthers)

    // 1. 如果带有搜索词修改且未显式指定 page，自动将 page 复位为 1
    const patch: Record<string, unknown> = { ...rawParams }
    if ('kw' in patch && !('page' in patch)) {
      patch.page = 1
    }

    // 2. 优先通过页面 useTableQuery 注册的调度器执行原子更新
    const handledLocally = updatePageSearchParams(patch)
    if (handledLocally) {
      return {
        ok: true,
        applied: patch,
        note: '当前页面的搜索参数与表格已成功更新。',
      }
    }

    // 3. 兜底方案：通过浏览器 URL 参数与客户端导航更新
    if (typeof window !== 'undefined') {
      const currentSearchParams = new URLSearchParams(
        resetOthers ? '' : window.location.search,
      )
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') {
          currentSearchParams.delete(key)
        } else {
          currentSearchParams.set(key, String(value))
        }
      }

      const pathname = window.location.pathname
      const newQuery = currentSearchParams.toString()
      const target = newQuery ? `${pathname}?${newQuery}` : pathname
      ctx.navigate(target)

      return {
        ok: true,
        applied: patch,
        target,
        note: '已通过路由导航更新页面搜索参数。',
      }
    }

    throw new Error('当前环境无法更新页面搜索参数。')
  },
}
