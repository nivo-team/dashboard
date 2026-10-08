import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { notFound, ok } from '../../utils/response'

/** 删除用户。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '根据 ID 删除单个用户',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '用户 ID',
      },
    ],
    responses: {
      200: {
        description: '删除结果',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'integer', description: '0 表示成功' },
                message: { type: 'string' },
                result: { type: 'null', description: '成功时为空' },
              },
              required: ['code'],
            },
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const id = Number(event.context.params?.id)
  if (!db.users.some((u) => u.id === id)) return notFound('用户')

  db.users = db.users.filter((u) => u.id !== id)
  return ok(null)
})
