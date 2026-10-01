import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { readNumber } from '../../utils/query'
import { fail, notFound, ok } from '../../utils/response'

/**
 * 查询某个角色已授权的菜单 ID。
 *
 * 单独一个接口而不是塞进角色详情：菜单授权是**独立资源**（`role_menus` 关联表），
 * 前端「分配菜单」弹窗/详情卡片只关心这份 id 列表，不必连带拉整个角色。
 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '查询角色已授权的菜单 ID 列表',
    parameters: [
      { in: 'query', name: 'role_id', required: true, schema: { type: 'integer' }, description: '角色 ID' },
    ],
    responses: {
      200: {
        description: '该角色的菜单授权',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleMenusResult' },
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const id = readNumber(event, 'role_id')
  if (id === undefined) return fail(400, '缺少 role_id')

  const role = db.roles.find((item) => item.id === id)
  if (!role) return notFound('角色')

  return ok({
    role_id: id,
    menu_ids: db.roleMenus.filter((rm) => rm.role_id === id).map((rm) => rm.menu_id),
  })
})
