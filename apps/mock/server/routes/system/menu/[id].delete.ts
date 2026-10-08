import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../../utils/db'
import { notFound, ok } from '../../../utils/response'

/** 删除功能节点（连同其所有下级）。 */
defineRouteMeta({
  openAPI: {
    tags: ['功能菜单'],
    description: '删除功能（其下级一并删除）',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '功能 ID',
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
  if (!db.menus.some((m) => m.menu_id === id)) return notFound('功能')

  // 递归收集后代：删父节点必须把整棵子树一起带走，否则会留下孤儿节点
  const doomed = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const row of db.menus) {
      if (!doomed.has(row.menu_id) && doomed.has(row.parent_id)) {
        doomed.add(row.menu_id)
        grew = true
      }
    }
  }

  db.menus = db.menus.filter((m) => !doomed.has(m.menu_id))
  return ok(null)
})
