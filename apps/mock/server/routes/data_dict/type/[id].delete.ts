import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../../utils/db'
import { fail, notFound, ok } from '../../../utils/response'

/**
 * 删除字典分类。
 *
 * 分类下还有子分类或字典项时**拒绝删除**：真实后端就是这么拦的，
 * 前端也有一套「删除前先查该项下有没有字典项」的预检，两边语义保持一致。
 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '删除字典分类（存在子分类或字典项时会被拒绝）',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '分类 ID',
      },
    ],
    responses: {
      200: {
        description: '删除结果；被拒绝时 code 非 0',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'integer', description: '0 表示成功' },
                message: { type: 'string', description: '失败原因' },
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
  if (!db.dictTypes.some((t) => t.id === id)) return notFound('字典分类')

  if (db.dictTypes.some((t) => t.parent_id === id)) {
    return fail(400, '该分类下还有子分类，请先删除子分类')
  }
  const itemCount = db.dictItems.filter((item) => item.type_id === id).length
  if (itemCount > 0) {
    return fail(400, `该分类下还有 ${itemCount} 个字典项，请先删除字典项`)
  }

  db.dictTypes = db.dictTypes.filter((t) => t.id !== id)
  return ok(null)
})
