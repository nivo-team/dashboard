import { searchPageCatalog } from '../page-catalog'
import { findEndpointSpec } from '../endpoint-specs'
import type { AiToolDefinition } from '../types'

/**
 * **页面检索** —— 让模型先"模糊搜一下想要的功能"，再决定去哪一页。
 *
 * ## 为什么需要它（而不是直接把页面清单塞进提示词）
 *
 * 后台的页面会越来越多，把每一页的 `desc` 都塞进 system 提示词，等于每轮都为
 * 一堆无关页面付 token，还把当前真正相关的信息稀释掉。改成按需检索之后：
 *
 * - 模型手里只有**工具目录一句话**（"能按功能描述检索页面"），不占多少上下文；
 * - 真正需要时调一次，只拿回**命中的那几页**的标题 + 一句话描述；
 * - 认准了目标页，再用 `get_page_context` 取它的接口与字段明细。
 *
 * 这同时是一道**过滤点**：将来按权限收窄可见页面，条件加在 `searchPageCatalog` 一处。
 *
 * 与 `list_navigation` 的分工：那一个给的是**导航视角的页面名 + 路径**（"能去哪"，
 * 用于跳转）；这一个给的是**功能视角的描述**（"哪一页能干这件事"）。两者都来自
 * 同一批路由，但回答的是不同问题 —— 别互相替代。
 */
export const searchPagesTool: AiToolDefinition = {
  name: 'search_pages',
  catalogDescription: '按功能描述检索后台的页面',
  description:
    '按功能 / 业务名词检索后台有哪些页面能做这件事，返回页面标题、一句话描述、路径与所需权限。用户提到某类功能（「能改工单状态的地方」「管角色的页面」）而你不确定落在哪一页时用它；认准目标页后再用 get_page_context 取该页的接口与字段。不传 keyword 则列出全部页面。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '功能或业务名词，例如「工单」「角色授权」「字典」；不传则列出全部',
      },
      limit: {
        type: 'number',
        description: '返回条数上限，默认 12',
      },
    },
    additionalProperties: false,
  },
  capability: 'page:read',
  execute: async (input) => {
    const keyword = typeof input.keyword === 'string' ? input.keyword : ''
    const rawLimit = typeof input.limit === 'number' ? input.limit : 12
    const limit = Math.min(Math.max(Math.trunc(rawLimit) || 12, 1), 50)

    const { total, items } = searchPageCatalog(keyword, limit)
    return {
      total,
      keyword: keyword || null,
      /*
        给检索需要的轻量信息：标题 + 描述 + 路径 + 权限点，外加**每页用到的接口**
        （method + path + 一句用途）。

        为什么把接口也带上：跨页面数据聚合时，模型要的正是"哪几页、分别调什么接口"——
        先给它这个，它就能直接 `call_read_api` 取数汇总，而不必逐页跳过去再回来。
        参数明细**不在这里**（那由 endpoint-specs 在 `get_page_context` 里补），
        所以这一份仍然很轻。
      */
      items: await Promise.all(
        items.map(async (entry) => ({
          path: entry.path,
          title: entry.title,
          desc: entry.desc,
          ...(entry.entities?.length ? { entities: entry.entities } : {}),
          ...(entry.permission ? { permission: entry.permission } : {}),
          ...(entry.endpoints?.length
            ? {
                endpoints: await Promise.all(
                  entry.endpoints.map(async (ref) => {
                    const spec = await findEndpointSpec(ref.method, ref.path)
                    return {
                      method: ref.method,
                      path: ref.path,
                      ...(ref.purpose ? { purpose: ref.purpose } : {}),
                      ...(spec?.summary ? { summary: spec.summary } : {}),
                    }
                  }),
                ),
              }
            : {}),
        })),
      ),
      note:
        total > items.length
          ? `共 ${total} 页命中，只返回前 ${items.length} 条；请用更具体的关键词收窄。跨页面统计时可直接按上面的 endpoints 调 call_read_api 取数汇总，不必逐页跳转。`
          : '需要某一页接口的**参数明细**时，再用 get_page_context 并传该页的 path。',
    }
  },
}
