import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../../utils/db'
import { notFound, ok } from '../../../utils/response'

/** 查询单个用户详情。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '根据用户 ID 查询详情',
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
        description: '用户详情',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserResult' },
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const id = Number(event.context.params?.id)
  const user = db.users.find((u) => u.id === id)
  if (!user) return notFound('用户')

  return ok(user)
})
