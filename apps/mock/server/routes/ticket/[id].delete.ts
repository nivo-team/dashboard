import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { notFound, ok } from '../../utils/response'

/**
 * 删除**单条**工单。
 *
 * ⚠️ 刻意**不提供** `POST /ticket/batch-delete`：批量删除必须由 AI 编排 N 次单条调用
 * （见 `index.get.ts` 的说明与 `manage_tasks` 工具）。
 */
defineRouteMeta({
  openAPI: {
    tags: ['工单'],
    description: '根据 ID 删除单个工单（不提供批量删除接口）',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: '工单 ID' },
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
  if (!db.tickets.some((t) => t.id === id)) return notFound('工单')

  db.tickets = db.tickets.filter((t) => t.id !== id)
  return ok(null)
})
