import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db } from '../../utils/db'
import { fail, notFound, ok } from '../../utils/response'

/**
 * 替换某个角色的菜单授权（全量覆盖语义）。
 *
 * 为什么是 PUT + 全量覆盖而不是增删单条：前端「分配菜单」是一棵树的勾选结果，
 * 提交的是**完整集合**；逐条 diff 的接口在并发下会产生中间态。
 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '替换角色的菜单授权（全量覆盖）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              role_id: { type: 'integer', description: '角色 ID' },
              menu_ids: {
                type: 'array',
                description: '该角色可见的全部菜单 ID（含目录 / 菜单 / 操作）',
                items: { type: 'integer' },
              },
            },
            required: ['role_id', 'menu_ids'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '替换后的菜单授权',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleMenusResult' },
          },
        },
      },
    },
  },
})

interface UpdateRoleMenusBody {
  role_id?: number
  menu_ids?: number[]
}

export default defineHandler(async (event) => {
  const body = ((await readBody<UpdateRoleMenusBody>(event).catch(() => undefined)) ??
    {}) as UpdateRoleMenusBody

  const roleId = Number(body.role_id)
  if (!Number.isFinite(roleId)) return fail(400, '缺少 role_id')

  const role = db.roles.find((item) => item.id === roleId)
  if (!role) return notFound('角色')

  if (!Array.isArray(body.menu_ids)) return fail(400, 'menu_ids 必须是数组')

  // 去重 + 只保留真实存在的菜单；不存在的 id 直接忽略（从宽处理，与其它 mock 接口一致）
  const knownIds = new Set(db.menus.map((m) => m.menu_id))
  const nextIds = [...new Set(body.menu_ids.map(Number).filter((id) => knownIds.has(id)))]

  db.roleMenus = [
    ...db.roleMenus.filter((rm) => rm.role_id !== roleId),
    ...nextIds.map((menu_id) => ({ role_id: roleId, menu_id })),
  ]

  return ok({ role_id: roleId, menu_ids: nextIds })
})
