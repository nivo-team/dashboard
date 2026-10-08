import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { notFound, ok } from '../../utils/response'

/** 角色详情。 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '根据 ID 查询角色详情',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'integer' },
        description: '角色 ID',
      },
    ],
    responses: {
      200: {
        description: '角色详情',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleResult' },
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

  return ok({
    ...role,
    menu_count: db.roleMenus.filter((rm) => rm.role_id === id).length,
  })
})
