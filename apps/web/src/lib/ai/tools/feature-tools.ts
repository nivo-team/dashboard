import {
  findFeatureCommand,
  readFeatureData,
  resolveFeature,
  resolveFeatureCommands,
} from '#/lib/features/registry'
import { getPageContext } from '../page-context'
import type { AiToolDefinition } from '../types'
import { truncatePayload } from './data-tools'

/**
 * 「页面数据 / 页面指令」工具 —— **面板模式的核心收益**。
 *
 * ## 为什么要 `get_page_data`
 *
 * 用户就坐在页面上问「这一屏里有多少个没邮箱的」「刚才那条删了吗」。此前模型只能：
 * ① 调 `update_search_params` 改 URL 让用户自己看；② 用 `call_read_api` 把同一批数据
 * **再拉一遍** —— 既慢又可能和屏幕上的不一致（用户刚翻了页、刚改了筛选，模型手里的是旧参数）。
 *
 * 页面自己知道答案：`feature.ts` 里的 `dataSources` 声明了"我现在有什么数据"。
 * 这个工具直接把它读出来（**同步快照，不发请求**），顺带给出这一页可用的指令清单。
 *
 * ## 为什么要 `run_page_command`
 *
 * 页面的动作不只是"发一个请求" —— 删除要弹确认、发 toast、刷新表格、清空选中。
 * 让模型走 `call_write_api` 只能改库，界面停在旧数据上。`run_page_command` 执行的是
 * **页面自己的处理函数**（`command.run`），副作用与用户点按钮完全一致。
 *
 * 两件事的权限判定都在 `resolveFeatureCommands`（`hasPageCapabilityPermission`）一处：
 * 模型看不到没权限的指令，就不会去猜"为什么不行"。
 */

export const getPageDataTool: AiToolDefinition = {
  name: 'get_page_data',
  description:
    '读取**当前页面已经加载好的数据**（列表行、当前筛选、分页、选中项等），以及这一页可用的指令清单。用户在面板里问「这一屏 / 当前列表 / 刚才那条」时**先用它** —— 页面里的数据不用再调接口查一遍。**返回 `data: []` 表示这一页还没声明数据源**（未迁移的页面就是这样），那就改用 `search_api` + `call_read_api` 取数。',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: '可选。只读某一个数据源（按数据源 id，如 users）；不传则返回全部',
      },
    },
    additionalProperties: false,
  },
  access: 'read',
  group: 'page',
  execute: async (input) => {
    const context = getPageContext()
    const routeId = context.routePath
    const spec = resolveFeature(routeId)

    /*
      页面**没声明数据源**（还没迁到 `src/features` 的页面、或外壳页面）时**不抛错**：
      抛错会让模型以为"这次调用失败了"、可能重试，而它真正该做的是换个取数路径。
      所以这里返回一条**结构化的空结果 + 明确的下一步**：data 空、note 指路。
      （全屏容器里这个工具根本不会下发，见 `getAllowedTools` 的 surface 过滤。）
    */
    if (!spec) {
      return {
        page: {
          title: context.navLabel ?? context.title ?? routeId ?? '当前页面',
          description: '这一页还没有向 AI 声明数据源',
        },
        data: [],
        commands: [],
        note: '当前页面没有声明的数据源，`get_page_data` 读不到东西。请改用 `search_api` + `call_read_api` 取数（面板模式也可以用 `get_page_context` 看这一页用到的接口与参数）。',
      }
    }

    const wanted = typeof input.source === 'string' ? input.source.trim() : ''
    const sources = readFeatureData(routeId)
    const picked = wanted
      ? sources.filter((source) => source.id === wanted)
      : sources

    if (wanted && picked.length === 0) {
      throw new Error(
        `没有这个数据源：${wanted}。可用的是：${sources.map((source) => source.id).join(' / ') || '（无）'}`,
      )
    }

    const commands = resolveFeatureCommands(routeId).map((command) => ({
      id: command.id,
      title: command.title,
      ...(command.description ? { description: command.description } : {}),
      kind: command.kind,
      ...(command.inputSchema ? { inputSchema: command.inputSchema } : {}),
    }))

    return truncatePayload({
      page: {
        title: spec.title,
        description: spec.description,
        ...(spec.entities?.length ? { entities: [...spec.entities] } : {}),
      },
      data: picked,
      commands,
      note:
        '这些数据是**页面此刻已经加载的**（`state` 里是当前筛选 / 分页 / 选中）。据此直接回答即可；要改数据用 `run_page_command`（写类会先弹确认卡）。',
    })
  },
}

export const runPageCommandTool: AiToolDefinition = {
  name: 'run_page_command',
  description:
    '执行**当前页面上声明的一条指令**（如「删除这条记录」「批量删除选中项」「导出」「打开新建表单」）。指令 id 与参数以 `get_page_data` 返回的 `commands` 为准，**不要自己编 id**。写类指令（kind=write）会先弹确认卡，删除类还会标明不可撤销；用户拒绝就停下、不要重试同一条指令。',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '指令 id，例如 delete-user（必须是 get_page_data 列出来的）',
      },
      input: {
        type: 'object',
        description: '指令参数（按该指令的 inputSchema 传；没有参数就不传）',
        additionalProperties: true,
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  access: 'commit',
  group: 'page',
  execute: async (input, ctx) => {
    const routeId = ctx.getPageContext().routePath
    const commandId = typeof input.command === 'string' ? input.command.trim() : ''
    if (!commandId) throw new Error('缺少指令 id')

    const command = findFeatureCommand(routeId, commandId)
    if (!command) {
      const available = resolveFeatureCommands(routeId).map((item) => item.id)
      throw new Error(
        available.length > 0
          ? `当前页面没有这条指令：${commandId}。可用的是：${available.join(' / ')}`
          : '当前页面没有声明任何可执行指令。请改用对应的接口工具（call_read_api / call_write_api / navigate_to）。',
      )
    }

    const commandInput =
      input.input && typeof input.input === 'object'
        ? (input.input as Record<string, unknown>)
        : {}

    /*
      审批策略：指令自己声明 > 按 kind 推断（write 一律确认）。
      `write` 默认要确认的理由与 `call_write_api` 相同 —— 页面指令同样没有"可预览的表单"这一层兜底。
    */
    const needsApproval =
      command.approval === 'always' ||
      (command.approval !== 'auto' && command.kind === 'write')

    if (needsApproval) {
      const approved = await ctx.requestApproval({
        toolName: 'run_page_command',
        input: { command: command.id, title: command.title, input: commandInput },
        reason: command.destructive
          ? '这是一次删除操作，执行后无法撤销'
          : `这会在页面上执行「${command.title}」`,
      })
      if (!approved) {
        throw new Error(
          `用户拒绝了「${command.title}」，指令没有执行。不要重试同一条指令，改为向用户说明并询问下一步。`,
        )
      }
    }

    const result = await command.run(commandInput)
    return truncatePayload({
      ok: true,
      command: command.id,
      title: command.title,
      result: result ?? null,
    })
  },
}
