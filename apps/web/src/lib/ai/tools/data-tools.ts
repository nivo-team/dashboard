import { client, getApiQueryOptions, getDataDictOptionsQueryOptions } from '#/api'
import { normalizeDictOptions } from '#/lib/dict-options'
import type { ApiItem } from '#/api'
import type { AiToolContext, AiToolDefinition } from '../types'

/**
 * 「取数」类工具：检索接口清单、调用只读接口、读字典枚举。
 *
 * 两条安全约定（见 .agents/docs/ai-integration.md §3.3）：
 * 1. **白名单**：只能调 `GET /api` 清单里真实存在、且 method 为 GET 的接口 ——
 *    清单既是给模型检索的索引，也是它无法越过的边界；
 * 2. **只读**：这里没有任何写方法。写操作将来走 `commit` 工具 + 人工审批，不在这条路上开口子。
 */

/** 接口清单是静态路由表：30 分钟内不重复请求（与 `feature-apis.ts` 保持同一个量级）。 */
const API_LIST_STALE_TIME = 30 * 60 * 1000
const DICT_STALE_TIME = 30 * 60 * 1000
/**
 * 结果超过这个长度就截断：列表接口动辄几百条，整包塞进上下文会挤掉真正有用的信息。
 *
 * 从 12000 降到 6000：单条 12000 字符约合 5K token，而**它会跟着后面每一轮重发**
 * （见 `runtime.ts` 的历史衰减，那里只兜住"更早的轮次"）。截断时会明确告诉模型
 * 被截断了，它改用更精确的参数或分页即可，不会拿半截数据当全量。
 */
const MAX_RESULT_CHARS = 6_000

async function loadApiItems(ctx: AiToolContext): Promise<ApiItem[]> {
  const data = await ctx.queryClient.fetchQuery({
    ...getApiQueryOptions(),
    staleTime: API_LIST_STALE_TIME,
  })
  return data?.result ?? []
}

/**
 * 超长结果的处理：**明确告诉模型被截断了**，并给出原始长度 ——
 * 否则它会拿一段截断的数据当全量去统计，得出错误结论。
 */
function truncatePayload(value: unknown): unknown {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    return value
  }
  if (typeof text !== 'string' || text.length <= MAX_RESULT_CHARS) return value
  return {
    truncated: true,
    note: `结果过长（约 ${text.length} 字符），已截断。请改用更精确的查询参数或分页缩小范围。`,
    preview: text.slice(0, MAX_RESULT_CHARS),
  }
}

export const searchApiTool: AiToolDefinition = {
  name: 'search_api',
  description:
    '在系统的接口清单里检索接口（按关键词匹配方法与路径）。仅在「跨多个模块的综合统计或多源数据汇总」（单页面无法呈现）时使用。对于单一管理页面的查询需求，优先 navigate_to 前往对应页面并在界面呈现。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '关键词，例如 user、data_dict、menu',
      },
      limit: {
        type: 'number',
        description: '返回条数上限，默认 20，最大 50',
      },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
  access: 'read',
  group: 'data',
  execute: async (input, ctx) => {
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase() : ''
    if (!keyword) throw new Error('缺少检索关键词')

    const rawLimit = typeof input.limit === 'number' ? input.limit : 20
    const limit = Math.min(Math.max(Math.trunc(rawLimit) || 20, 1), 50)

    const items = await loadApiItems(ctx)
    const matched = items.filter((item) => {
      const haystack = `${item.method ?? ''} ${item.path ?? ''} ${item.label ?? ''}`.toLowerCase()
      return haystack.includes(keyword)
    })

    return {
      total: matched.length,
      items: matched.slice(0, limit).map((item) => ({
        method: item.method,
        path: item.path,
        label: item.label,
      })),
      note:
        matched.length > limit
          ? `仅返回前 ${limit} 条，共 ${matched.length} 条命中；请用更精确的关键词收窄。`
          : undefined,
    }
  },
}

export const callReadApiTool: AiToolDefinition = {
  name: 'call_read_api',
  description:
    '调用只读（GET）业务接口取回真实数据。注意：仅在「跨多个模块的组合统计、数据对比或综合分析」（单一管理页面无法呈现）时才调用此接口在聊天框中输出表格。若是单模块单页面上的列表浏览或搜索过滤（如 @user:list、查看用户等），严禁直接调用本工具，必须优先使用 navigate_to 带用户前往该页面并使用 update_search_params 在界面上直观呈现！',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '接口路径，例如 /api/user' },
      query: {
        type: 'object',
        description: '查询参数对象，例如 { page: 1, page_size: 20 }',
        additionalProperties: true,
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  access: 'read',
  group: 'data',
  execute: async (input, ctx) => {
    const path = typeof input.path === 'string' ? input.path.trim() : ''
    if (!path) throw new Error('缺少接口路径')

    const items = await loadApiItems(ctx)
    const matched = items.find(
      (item) => item.path === path && (item.method ?? '').toUpperCase() === 'GET',
    )
    if (!matched) {
      throw new Error(
        `接口不在只读清单里，或它不是 GET：${path}。请先用 search_api 确认接口路径。`,
      )
    }

    const query =
      input.query && typeof input.query === 'object'
        ? (input.query as Record<string, unknown>)
        : undefined

    const result = await client.get({ url: path, query })
    if (result.error) {
      const message =
        typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
      throw new Error(`接口调用失败：${message}`)
    }

    return truncatePayload(result.data)
  },
}

export const listDictOptionsTool: AiToolDefinition = {
  name: 'list_dict_options',
  description:
    '读取数据字典的枚举选项（值 → 文案）。接口返回的 status、type 这类数字含义用它翻译成人话；反查「哪个值对应某个文案」也用它。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '字典键，例如 user.status；省略则只返回有哪些键',
      },
    },
    additionalProperties: false,
  },
  access: 'read',
  group: 'data',
  execute: async (input, ctx) => {
    const data = await ctx.queryClient.fetchQuery({
      ...getDataDictOptionsQueryOptions(),
      staleTime: DICT_STALE_TIME,
    })
    const map = normalizeDictOptions(data?.result)

    const path = typeof input.path === 'string' ? input.path.trim() : ''
    if (!path) return { keys: Object.keys(map) }

    const options = map[path]
    if (!options) {
      throw new Error(`没有这个字典键：${path}。可用键见不传 path 时的返回结果。`)
    }
    return { path, options }
  },
}

/**
 * 写操作工具：**唯一一个「两个模式都要人工审批」的工具**。
 *
 * 三道闸门（缺一不可）：
 * 1. **权限**：`readonly` 档不给它；`custom` 档要用户显式勾选；`full` 档才默认带上
 *    （见 `getAllowedTools`）—— 早先这里写的是"只有 auto 模式的工具集里才有它"，
 *    那是把**权限**错当成了**模式**；
 * 2. **白名单**：路径与 method 都必须能在 `GET /api` 清单里对上 —— 与只读工具同一份边界；
 * 3. **人工审批**：真正发请求之前 `await ctx.requestApproval(...)`，用户点了「允许」才发。
 *    **`ask` 与 `auto` 都要问**，刻意不读 `ctx.mode`：表单提交在 auto 下可以免确认，
 *    因为表单自己用 `canSubmit()` 把关、用户也能看见填了什么；而通用写接口没有可预览的表单，
 *    自动执行等于让模型直接改库。被拒绝时**直接抛错**（而不是静默跳过）：
 *    模型必须知道这次没执行，才不会向用户谎报成功。
 */
export const callWriteApiTool: AiToolDefinition = {
  name: 'call_write_api',
  description:
    '调用一个会**修改数据**的接口（POST / PUT / PATCH / DELETE）。执行前系统一定会请用户确认；如果用户拒绝，会返回失败，此时不要重复尝试同一个请求，改为向用户说明并询问下一步。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '接口路径，必须是 search_api 返回过的接口' },
      method: {
        type: 'string',
        enum: ['POST', 'PUT', 'PATCH', 'DELETE'],
        description: 'HTTP 方法',
      },
      query: {
        type: 'object',
        description: '查询参数对象（可选）',
        additionalProperties: true,
      },
      body: {
        type: 'object',
        description: '请求体（JSON 对象，可选）',
        additionalProperties: true,
      },
    },
    required: ['path', 'method'],
    additionalProperties: false,
  },
  access: 'commit',
  group: 'data',
  execute: async (input, ctx) => {
    const path = typeof input.path === 'string' ? input.path.trim() : ''
    if (!path) throw new Error('缺少接口路径')

    /*
      用**字面量比较**而不是 `Set.has`：这样 TS 会把 `method` 收窄成四个字面量的联合，
      下面才能走 `client.post / put / patch / delete` —— 而 `client.request` 的 `method`
      参数是 `HttpMethod` 联合类型，直接塞一个 `string` 是过不了类型检查的。
    */
    const rawMethod =
      typeof input.method === 'string' ? input.method.trim().toUpperCase() : ''
    if (
      rawMethod !== 'POST' &&
      rawMethod !== 'PUT' &&
      rawMethod !== 'PATCH' &&
      rawMethod !== 'DELETE'
    ) {
      throw new Error(`只支持 POST / PUT / PATCH / DELETE，收到的是：${rawMethod || '空'}`)
    }
    const method = rawMethod

    // 白名单：清单里存在、且 method 完全一致 —— 清单也是「AI 能碰哪些接口」的边界
    const items = await loadApiItems(ctx)
    const matched = items.find(
      (item) => item.path === path && (item.method ?? '').toUpperCase() === method,
    )
    if (!matched) {
      throw new Error(
        `接口不在清单里，或 method 不匹配：${method} ${path}。请先用 search_api 确认。`,
      )
    }

    const query =
      input.query && typeof input.query === 'object'
        ? (input.query as Record<string, unknown>)
        : undefined
    const body =
      input.body && typeof input.body === 'object'
        ? (input.body as Record<string, unknown>)
        : undefined

    // 审批：把 method / path / 参数原样交给用户看，DELETE 额外标一句不可撤销
    const approved = await ctx.requestApproval({
      toolName: 'call_write_api',
      input: { method, path, query, body },
      reason:
        method === 'DELETE'
          ? '这是一次删除操作，执行后无法撤销'
          : '这会修改服务端的数据',
    })
    if (!approved) {
      throw new Error(
        '用户拒绝了这次操作，请求没有发出。不要重试同一个请求，改为向用户说明并询问下一步。',
      )
    }

    const requestOptions = { url: path, query, body }
    const result =
      method === 'POST'
        ? await client.post(requestOptions)
        : method === 'PUT'
          ? await client.put(requestOptions)
          : method === 'PATCH'
            ? await client.patch(requestOptions)
            : await client.delete(requestOptions)

    if (result.error) {
      const message =
        typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
      throw new Error(`接口调用失败：${message}`)
    }

    return truncatePayload(result.data)
  },
}
