import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { notFound, ok } from '../../utils/response'

/** 删除字典项。 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '删除字典项',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '字典项 ID',
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
  if (!db.dictItems.some((item) => item.id === id)) return notFound('字典项')

  db.dictItems = db.dictItems.filter((item) => item.id !== id)
  return ok(null)
})
