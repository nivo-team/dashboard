import type { AiToolDefinition } from '../types'

/**
 * Router 阶段的「选工具」工具 —— **不是业务工具**。
 *
 * 为什么独立于 `AI_TOOLS`：
 * - 权限清单（设置 → AI → AI 权限）列的是「AI 能做什么」，把一个"选工具的工具"列进去没有意义；
 * - 工具卡片 / 权限过滤 / Catalog 都只该看见业务工具；
 * - 它的 `execute` 也不在这里 —— 选择结果要落进**本轮运行时**的闭包（见 `runtime.ts`），
 *   而不是某个可以独立执行的业务动作。
 *
 * 它与 `AI_TOOLS` 共用同一份契约类型（本文件只取用其中的四个字段），
 * 于是"Catalog 与完整定义同源"这条约束在类型上也成立。
 */

/** Router 阶段要用的四个字段 —— 与 `AiToolDefinition` 同源，不另立一份契约。 */
type RouterToolSpec = Pick<
  AiToolDefinition,
  'name' | 'catalogDescription' | 'description' | 'inputSchema'
>

/** Router 工具的名字（运行时用它把这一步的选择结果认出来）。 */
export const SELECT_TOOLS_NAME = 'select_tools'

/**
 * 给 Router 阶段的模型看的工具定义。
 *
 * `inputSchema` 就是「严格结构化输出」的落点：模型只能通过调用它来交付选择结果，
 * 于是**不需要上游支持 `response_format`**（AI Gateway 后面的网关与厂商支持情况不一），
 * 与仓库「不引 zod、用 JSON Schema」的既有约定一致。
 */
export const SELECT_TOOLS_SPEC: RouterToolSpec = {
  name: SELECT_TOOLS_NAME,
  catalogDescription: '选择完成本次请求需要的工具',
  description: [
    '根据用户这一轮的请求，选出完成它需要的工具。',
    '只在这个工具里交付选择结果：`tools` 是要加载的工具名数组、`intent` 是这一轮请求的主要意图，**不要**在调用它的同时回答用户。',
    '只有这三类不需要任何业务工具、直接回答即可，**不要**调用本工具：打招呼、道谢、纯翻译。',
    '其余请求（含问数据、要页面、填表、改数据、跨模块统计）**一律先用本工具选工具**，不要在没拿到工具时凭空回答。',
    '【多任务与批量写操作特别注意】：当用户要求处理多个对象、批量新建/录入数据（如新建 N 条数据）、生成测试数据、或执行多步骤复合任务时，必须同时选中 `manage_tasks`、`call_write_api` 与表单工具，不得漏选！',
    '宁可少选也不要乱选：多选会让执行阶段多加载用不上的完整定义；选漏了执行阶段会拿不到那个能力。',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        /*
          用 `enum` 而不是"描述里列一遍取值"：体量更小、也更确定（写不出集合外的值）。
          这些取值只用于日志与后续的画像化加载，**不参与业务判断**。
        */
        enum: [
          'greeting',
          'translation',
          'navigation',
          'page_query',
          'page_analysis',
          'form',
          'write',
          'api_query',
          'complex',
          'out_of_scope',
          'ambiguous',
        ],
        description:
          '本轮请求的主要意图（取 enum 里的一个值）；只用于日志，不影响工具选择',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description:
          '要加载的工具名（取 Catalog 里的名字）；一个都不需要时传空数组',
      },
    },
    required: ['intent', 'tools'],
    additionalProperties: false,
  },
}
