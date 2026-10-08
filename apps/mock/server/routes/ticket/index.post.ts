import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nextId, nowSeconds, type TicketRow } from '../../utils/db'
import { fail, ok } from '../../utils/response'

/** 新建工单（单条 —— 没有批量端点，见 index.get.ts 的说明）。 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '新建工单',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '标题' },
              description: { type: 'string', description: '描述' },
              priority: { type: 'integer', description: '1 低 / 2 中 / 3 高 / 4 紧急' },
              assignee: { type: 'string', description: '负责人' },
              category: { type: 'string', description: '分类' },
            },
            required: ['title'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的工单',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/TicketResult' } } },
      },
    },
  },
})

interface CreateTicketBody {
  title?: string
  description?: string
  priority?: number
  assignee?: string
  category?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<CreateTicketBody>(event).catch(() => undefined)) ??
    {}) as CreateTicketBody
  const title = String(body.title ?? '').trim()
  if (!title) return fail(400, '请输入工单标题')

  const ts = nowSeconds()
  const ticket: TicketRow = {
    id: nextId('ticket'),
    title,
    description: String(body.description ?? '').trim(),
    // 新建的工单一律「待处理」，优先级越界时收敛为「中」
    status: 1,
    priority: normalizePriority(body.priority),
    assignee: String(body.assignee ?? '未分配').trim() || '未分配',
    category: String(body.category ?? '咨询').trim() || '咨询',
    created_at: ts,
    updated_at: ts,
  }

  db.tickets.unshift(ticket)
  return ok(ticket)
})

function normalizePriority(value: unknown): number {
  const num = Number(value)
  return num === 1 || num === 2 || num === 3 || num === 4 ? num : 2
}
