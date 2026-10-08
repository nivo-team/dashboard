import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { db } from '../../utils/db'
import { ok } from '../../utils/response'
import { paginate } from '../../utils/query'

/**
 * 工单分页列表。
 *
 * ⚠️ **这一族接口刻意没有批量端点**（对比 `/user` 的 `batch-delete`）：
 * 它用来验证 AI 在"后端只提供单条增删改"时的**自主编排**能力 ——
 * 正确做法是用 `manage_tasks` 一次编排整组步骤、由客户端顺序执行。
 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '工单分页列表，支持关键词、状态/优先级/分类筛选与服务端排序',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' }, description: '页码，从 1 开始' },
      { in: 'query', name: 'page_size', schema: { type: 'integer' }, description: '每页条数' },
      {
        in: 'query',
        name: 'kw',
        schema: { type: 'string' },
        description: '关键词（标题 / 描述 / 负责人 / ID 模糊匹配）',
      },
      {
        in: 'query',
        name: 'status',
        schema: { type: 'integer' },
        description: '状态精确匹配：1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭',
      },
      {
        in: 'query',
        name: 'priority',
        schema: { type: 'integer' },
        description: '优先级精确匹配：1 低 / 2 中 / 3 高 / 4 紧急',
      },
      { in: 'query', name: 'category', schema: { type: 'string' }, description: '分类精确匹配' },
      { in: 'query', name: 'assignee', schema: { type: 'string' }, description: '负责人模糊匹配' },
      { in: 'query', name: 'id', schema: { type: 'integer' }, description: '工单 ID 精确匹配' },
      {
        in: 'query',
        name: 'created_at_min',
        schema: { type: 'integer' },
        description: '创建时间下限（秒级时间戳）',
      },
      {
        in: 'query',
        name: 'created_at_max',
        schema: { type: 'integer' },
        description: '创建时间上限（秒级时间戳）',
      },
      {
        in: 'query',
        name: 'field',
        schema: {
          type: 'string',
          enum: ['id', 'title', 'status', 'priority', 'created_at', 'updated_at'],
        },
        description: '排序字段名',
      },
      {
        in: 'query',
        name: 'order',
        schema: { type: 'string', enum: ['asc', 'desc'] },
        description: '排序方向',
      },
    ],
    responses: {
      200: {
        description: '工单分页结果',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/TicketListResult' } },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          TicketItem: {
            type: 'object',
            description: '工单行',
            properties: {
              id: { type: 'integer', description: '工单 ID' },
              title: { type: 'string', description: '标题' },
              description: { type: 'string', description: '描述' },
              status: { type: 'integer', description: '1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭' },
              priority: { type: 'integer', description: '1 低 / 2 中 / 3 高 / 4 紧急' },
              assignee: { type: 'string', description: '负责人' },
              category: { type: 'string', description: '分类' },
              created_at: { type: 'integer', description: '创建时间（秒级时间戳）' },
              updated_at: { type: 'integer', description: '更新时间（秒级时间戳）' },
            },
            required: ['id', 'title', 'status'],
          },
          TicketListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: '总条数' },
                  items: { type: 'array', items: { $ref: '#/components/schemas/TicketItem' } },
                },
                required: ['total', 'items'],
              },
            },
            required: ['code', 'result'],
          },
          TicketResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/TicketItem' },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const query = getQuery(event)
  const kw = String(query.kw ?? '')
    .trim()
    .toLowerCase()
  const status =
    query.status !== undefined && query.status !== '' ? Number(query.status) : undefined
  const priority =
    query.priority !== undefined && query.priority !== '' ? Number(query.priority) : undefined
  const category = String(query.category ?? '')
    .trim()
    .toLowerCase()
  const assignee = String(query.assignee ?? '')
    .trim()
    .toLowerCase()
  const filterId = query.id !== undefined && query.id !== '' ? Number(query.id) : undefined
  const createdMin =
    query.created_at_min !== undefined && query.created_at_min !== ''
      ? Number(query.created_at_min)
      : undefined
  const createdMax =
    query.created_at_max !== undefined && query.created_at_max !== ''
      ? Number(query.created_at_max)
      : undefined

  let rows = db.tickets.filter((t) => {
    if (
      kw &&
      !(
        t.title.toLowerCase().includes(kw) ||
        t.description.toLowerCase().includes(kw) ||
        t.assignee.toLowerCase().includes(kw) ||
        String(t.id).includes(kw)
      )
    ) {
      return false
    }
    if (filterId !== undefined && !Number.isNaN(filterId) && t.id !== filterId) return false
    if (status !== undefined && !Number.isNaN(status) && t.status !== status) return false
    if (priority !== undefined && !Number.isNaN(priority) && t.priority !== priority) return false
    if (category && t.category.toLowerCase() !== category) return false
    if (assignee && !t.assignee.toLowerCase().includes(assignee)) return false
    if (createdMin !== undefined && !Number.isNaN(createdMin) && t.created_at < createdMin)
      return false
    if (createdMax !== undefined && !Number.isNaN(createdMax) && t.created_at > createdMax)
      return false
    return true
  })

  const field = String(query.field ?? '').trim() as keyof (typeof rows)[number]
  const order = String(query.order ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
  if (field && ['id', 'title', 'status', 'priority', 'created_at', 'updated_at'].includes(field)) {
    rows = [...rows].sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (typeof va === 'string' && typeof vb === 'string') {
        return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return order === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va)
    })
  }

  return ok(paginate(rows, query))
})
