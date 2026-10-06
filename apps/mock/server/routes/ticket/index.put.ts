import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nowSeconds } from '../../utils/db'
import { fail, notFound, ok } from '../../utils/response'

/**
 * 更新工单（**单条**）。
 *
 * 一次只改一条（body 里带 `id`）—— 批量场景下 AI 必须自己编排 N 次调用，
 * 这正是这个模块要演示的能力。见 index.get.ts 的说明。
 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '更新单条工单（标题 / 描述 / 优先级 / 负责人 / 分类）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer', description: '工单 ID' },
              title: { type: 'string', description: '标题' },
              description: { type: 'string', description: '描述' },
              priority: { type: 'integer', description: '1 低 / 2 中 / 3 高 / 4 紧急' },
              assignee: { type: 'string', description: '负责人' },
              category: { type: 'string', description: '分类' },
            },
            required: ['id'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的工单',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/TicketResult' } } },
      },
    },
  },
})

interface UpdateTicketBody {
  id?: number
  title?: string
  description?: string
  priority?: number
  assignee?: string
  category?: string
}

export default defineHandler(async (event) => {
  const body = await readBody<UpdateTicketBody>(event).catch(() => ({}) as UpdateTicketBody)
  const id = Number(body?.id)
  if (!id) return fail(400, '工单 ID 不能为空')

  const ticket = db.tickets.find((t) => t.id === id)
  if (!ticket) return notFound('工单')

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) return fail(400, '工单标题不能为空')
    ticket.title = title
  }
  if (body.description !== undefined) ticket.description = String(body.description).trim()
  if (body.priority !== undefined) {
    const priority = Number(body.priority)
    if (priority >= 1 && priority <= 4) ticket.priority = priority
  }
  if (body.assignee !== undefined) ticket.assignee = String(body.assignee).trim() || '未分配'
  if (body.category !== undefined) ticket.category = String(body.category).trim() || '咨询'

  ticket.updated_at = nowSeconds()
  return ok(ticket)
})
