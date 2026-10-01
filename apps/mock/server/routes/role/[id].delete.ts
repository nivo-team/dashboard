import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { fail, notFound, ok } from '../../utils/response'

/** 删除角色（连同它的菜单授权）。 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '根据 ID 删除角色，同时清理该角色的菜单授权',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: '角色 ID' },
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
  const role = db.roles.find((item) => item.id === id)
  if (!role) return notFound('角色')

  /*
    内置角色（super / editor / viewer）不可删除：它们是三个测试账号的登录身份
    （见 `mock-accounts.ts` 的 `MockRole`），删掉之后 `/menus/navigation`
    会找不到角色、导航直接空掉 —— 那是演示链路自断，不是有效的业务场景。
  */
  if (['super', 'editor', 'viewer'].includes(role.code)) {
    return fail(400, '内置角色不可删除')
  }

  db.roles = db.roles.filter((item) => item.id !== id)
  // 关联表要一起清：留下孤儿授权会让「某菜单被谁授权过」对不上
  db.roleMenus = db.roleMenus.filter((rm) => rm.role_id !== id)

  return ok(null)
})
