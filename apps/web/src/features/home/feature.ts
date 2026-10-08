import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 仪表盘页的特性声明（`/$appId/home`）。
 *
 * 这一页是个**只读业务 + 可编排布局**的特殊形态，正好把契约的两半都用上：
 *
 * - `dataSources`：把「现在摆着哪些卡片、各自在哪一格、是不是默认布局」交给 AI ——
 *   用户问「我这页有什么卡片」时不用猜，也不用去翻接口（这一页本来就没有接口）；
 * - `commands`：卡片编排是**页面自己的能力**（拖 / 缩 / 加 / 移 / 重置），
 *   交给 AI 走 `run_page_command` 执行，落点是页面自己的 `handleAdd` / `handleRemove` /
 *   `handleReset` —— 于是「即时保存」的语义与 toast 提示都跟用户手点完全一致。
 *
 * **审批口径**：`add-widget` 标 `auto`（可逆、只动本机布局、加错了一张自己删掉即可），
 * `remove-widget` / `reset-dashboard-layout` 走默认的 `always`（会丢用户的编排）。
 *
 * 卡片清单本身**不在这里**：唯一真值是 `./widget-registry.tsx`（铁律 3），
 * 这里只接收页面解析好的标题与状态。
 */

/** 一张已摆上的卡片（标题已由页面按 `dashboard` 命名空间解析） */
export interface DashboardWidgetView {
  /** 卡片实例 id（移除时用它，不是 `type`） */
  id: string
  /** 卡片类型（注册表的 key，如 `overview`） */
  type: string
  title: string
  /** 8 列栅格里的位置与尺寸 */
  x: number
  y: number
  w: number
  h: number
}

/** 可添加的卡片类型（注册表里的全部） */
export interface DashboardWidgetOption {
  type: string
  title: string
  description?: string
  /** 已经在这块布局里了 */
  added: boolean
  /** 是否允许同时存在多张；`false` 且已添加时不能再加 */
  allowMultiple: boolean
}

export interface DashboardFeatureOptions {
  widgets: readonly DashboardWidgetView[]
  available: readonly DashboardWidgetOption[]
  /** 是否处于编辑模式（只影响提示，不影响能力） */
  editing: boolean
  /** 是否从未自定义过（跑的是默认布局） */
  isDefault: boolean
  addWidget: (type: string) => void
  removeWidget: (id: string) => void
  resetLayout: () => void
}

export function createDashboardFeature(options: DashboardFeatureOptions): FeatureSpec {
  const findOption = (type: string) => options.available.find((item) => item.type === type)

  return defineFeature({
    title: '仪表盘',
    description:
      '用户自定义的卡片工作台：卡片可拖动换位、缩放、添加与移除，布局按应用存在本机（即时保存）。',
    entities: ['卡片', '布局', '仪表盘'],
    dataSources: [
      {
        id: 'widgets',
        title: '当前仪表盘上的卡片',
        description: '这一页此刻摆着的卡片；`x / y / w / h` 就是它在 8 列栅格里的位置与尺寸',
        shape: '每张卡片：id（实例 id）/ type（卡片类型）/ title / x / y / w / h',
        state: () => ({
          editing: options.editing,
          isDefaultLayout: options.isDefault,
          count: options.widgets.length,
        }),
        read: () =>
          options.widgets.map((widget) => ({
            id: widget.id,
            type: widget.type,
            title: widget.title,
            x: widget.x,
            y: widget.y,
            w: widget.w,
            h: widget.h,
          })),
      },
      {
        id: 'available-widgets',
        title: '可添加的卡片类型',
        description: '注册表里的全部卡片；`added` 表示已经在这块布局里了',
        shape: 'type（加卡片时用它）/ title / description / added / allowMultiple',
        read: () => options.available,
      },
    ],
    commands: [
      {
        id: 'add-widget',
        title: '添加卡片',
        description:
          '把注册表里的某张卡片加到仪表盘上（会先落在最底部，再由布局压缩算法上提）。type 必须来自 available-widgets。',
        kind: 'write',
        // 可逆、且只改本机布局：不拦一道确认，避免"加一张卡片"也要弹卡
        approval: 'auto',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: '卡片类型，如 overview / metrics' },
          },
          required: ['type'],
          additionalProperties: false,
        },
        run: (input) => {
          const type = String(input.type ?? '').trim()
          const option = findOption(type)
          if (!option) {
            throw new Error(
              `没有这种卡片：${type}。可用的有：${options.available.map((item) => item.type).join(' / ')}`,
            )
          }
          if (option.added && !option.allowMultiple) {
            throw new Error(`「${option.title}」这类卡片只能有一张，它已经在仪表盘上了。`)
          }
          options.addWidget(type)
          return { added: type, title: option.title }
        },
      },
      {
        id: 'remove-widget',
        title: '移除卡片',
        description:
          '从仪表盘上移除一张卡片（**用实例 id**，不是卡片类型 —— 同类型可能有多张）。id 来自 widgets 数据源。',
        kind: 'write',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '卡片实例 id，如 widgets 数据源里的 id' },
          },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = String(input.id ?? '').trim()
          const widget = options.widgets.find((item) => item.id === id)
          if (!widget) {
            throw new Error(
              `仪表盘上没有 id=${id} 的卡片。请先用 get_page_data 确认当前卡片与它们的 id。`,
            )
          }
          options.removeWidget(id)
          return { removed: id, title: widget.title }
        },
      },
      {
        id: 'reset-dashboard-layout',
        title: '恢复默认布局',
        description: '把仪表盘恢复成默认卡片编排（会丢弃用户自己的拖动 / 缩放 / 增删结果）',
        kind: 'write',
        destructive: true,
        run: () => {
          options.resetLayout()
          return { reset: true }
        },
      },
    ],
  })
}
