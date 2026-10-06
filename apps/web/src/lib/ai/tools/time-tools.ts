import { reloadAiPageData } from '../page-reload-bridge'
import { resolveFeature } from '#/lib/features/registry'
import { getPageContext } from '../page-context'
import type { AiToolDefinition, AiTimeFacts } from '../types'

/**
 * 「当前时间」与「页面新鲜度」两个基础工具。
 *
 * ## 为什么 `get_current_time` 必须由浏览器回答
 *
 * 模型的训练数据有截止时间，它**永远不知道"现在"**；服务端中间层跑在 UTC，
 * 也不知道用户装的时区。于是「最近 3 天的记录」这类请求里，模型只能瞎猜一个时间戳 ——
 * 而接口要的是**精确的秒级边界**，猜错就是查错数据（且看起来毫无异常）。
 *
 * 所以这一个是**纯本地工具**：不发任何请求，直接从浏览器读三件事 ——
 * 绝对时刻（UTC）、操作系统时区、以及用户在本系统「外观」里选的展示时区。
 * 模型据此把相对时间换算成接口参数（多数字段用秒级时间戳，见 `createtime_min`）。
 *
 * ## 为什么把「刷新」收进同一个文件
 *
 * `reload_page_data` 与时间工具同属「基础页面功能」：它们都不改数据、不涉及权限点，
 * 只是让模型能把**手上的数据对齐到此刻**。放在一起是为了让「AI 的基础设施能力」
 * 有一个明确的落点，而不是散在各工具文件里。
 */

export const getCurrentTimeTool: AiToolDefinition = {
  name: 'get_current_time',
  catalogDescription: '获取用户浏览器的当前时间与时区',
  description:
    '读取用户此刻的真实时间与时区（浏览器提供，不是模型推测）。**凡是涉及相对时间**（今天 / 最近 3 天 / 本周 / 上个月 / 几小时前）的查询或筛选，都必须先调用它拿到绝对时间，再换算成接口参数；不要凭印象猜时间戳。返回里同时给出 UTC 时刻与用户展示时区下的本地时间。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  capability: 'page:read',
  execute: async (_input, ctx) => {
    const facts: AiTimeFacts = ctx.getTimeFacts()
    return {
      ...facts,
      note:
        '接口的时间筛选参数（如 createtime_min / createtime_max）多为**秒级时间戳**，直接用 nowUnixSeconds 加减即可；需要传日期字符串时用 todayLocal 那一天做基准。',
    }
  },
}

/**
 * 刷新当前页面的数据。
 *
 * 这是**只读**工具：它只是让页面按自己的语义重新取数（保留筛选 / 分页 / 排序），
 * 不改任何数据，也不涉及权限点。存在的意义是把「AI 手里的数据」与「屏幕上此刻的数据」
 * 对齐 —— 用户刚在别处改了数据、或者同一轮对话里隔了几步再看同一个列表时，
 * 不刷新就会基于一份过期快照下结论。
 *
 * 与写工具**自动刷新**的区别：那是写操作成功后的副作用（必须做）；这里是模型
 * **主动**要求对齐时的显式动作。两者都走 `page-reload-bridge` 同一处出口。
 */
export const reloadPageDataTool: AiToolDefinition = {
  name: 'reload_page_data',
  catalogDescription: '重新拉取当前页面的数据',
  description:
    '让当前页面按自己的语义重新取数（保留筛选 / 分页 / 排序），然后重新读取数据源。当用户说「刷新一下」「最新的数据」「是不是刚改过」或你手上的页面数据可能已过期时用它；它不改任何数据。',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: '可选。为什么要刷新（给用户看的一句话）',
      },
    },
    additionalProperties: false,
  },
  capability: 'page:read',
  execute: async (input, ctx) => {
    const routeId = getPageContext().routePath
    const spec = resolveFeature(routeId)
    if (!spec) {
      return {
        ok: false,
        note: '当前页面没有登记数据源 / 刷新能力（可能是外壳页面，或这一页还没接入 AI）。请改用 search_api + call_read_api 重新取数。',
      }
    }

    /*
      `reloadAiPageData()` 只覆盖"已登记重载闭包"的页面 —— 那是列表页把数据放在
      React state 里的情形（表格示例页就是）。返回 false 时回退到 react-query 的整体失效，
      与 `call_write_api` 写后刷新的兜底同源 —— 两处刷新语义必须一致。
    */
    const handled = reloadAiPageData()
    if (!handled) {
      await ctx.queryClient.invalidateQueries()
    }

    // 刷新是异步的（页面重新发请求），这里给模型一句明确的话：稍后再调 get_page_data 看新值
    return {
      ok: true,
      reloaded: handled ? 'page' : 'query-cache',
      reason: typeof input.reason === 'string' ? input.reason : null,
      note: '已触发刷新。数据是异步更新的，需要新值时紧接着再调用 get_page_data 读取；不要复用刷新之前的快照。',
    }
  },
}
