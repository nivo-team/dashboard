import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db } from '../../../utils/db'
import { fail, ok } from '../../../utils/response'

/** 批量删除用户。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '批量删除用户',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: { type: 'integer' },
                description: '待删除的用户 ID 列表',
              },
            },
            required: ['ids'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '批量删除结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BatchDeleteResult' },
          },
        },
      },
    },
  },
})

interface BatchDeleteBody {
  ids?: number[]
}

export default defineHandler(async (event) => {
  const body = await readBody<BatchDeleteBody>(event).catch(() => ({}) as BatchDeleteBody)
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n) => Number.isFinite(n)) : []
  if (ids.length === 0) return fail(400, '请提供有效的用户 ID 列表')

  const toDelete = new Set(ids)
  const initialCount = db.users.length
  db.users = db.users.filter((u) => !toDelete.has(u.id))
  const deletedCount = initialCount - db.users.length

  return ok({ deleted_count: deletedCount })
})
