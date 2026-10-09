import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../../utils/db'
import { notFound, ok } from '../../../utils/response'

/** 查询单条工单详情。 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '根据工单 ID 查询详情',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '工单 ID',
      },
    ],
    responses: {
      200: {
        description: '工单详情',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/TicketResult' } } },
      },
    },
  },
})

export default defineHandler((event) => {
  const id = Number(event.context.params?.id)
  const ticket = db.tickets.find((t) => t.id === id)
  if (!ticket) return notFound('工单')
  return ok(ticket)
})
