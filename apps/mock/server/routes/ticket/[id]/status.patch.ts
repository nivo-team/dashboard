import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nowSeconds } from '../../../utils/db'
import { fail, notFound, ok } from '../../../utils/response'

/**
 * 变更单条工单的状态（**独立的状态接口**，与更新接口分开）。
 *
 * 之所以单列一个 PATCH：真实后端的工单状态流转常带自己的业务校验与审计，
 * 不会塞进通用的 PUT。也让 AI 面对"只有增删改查 + 一个状态接口"的组合去编排
 * （如「把这一屏待处理的都关闭」= N 次 `PATCH /ticket/{id}/status`）。
 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '变更单条工单的状态',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: '工单 ID' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'integer', description: '1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭' },
            },
            required: ['status'],
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

interface UpdateStatusBody {
  status?: number
}

export default defineHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const ticket = db.tickets.find((t) => t.id === id)
  if (!ticket) return notFound('工单')

  const body = await readBody<UpdateStatusBody>(event).catch(() => ({}) as UpdateStatusBody)
  const status = Number(body?.status)
  if (![1, 2, 3, 4].includes(status)) {
    return fail(400, '状态必须是 1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭')
  }

  ticket.status = status
  ticket.updated_at = nowSeconds()
  return ok(ticket)
})
