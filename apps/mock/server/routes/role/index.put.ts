import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nowStamp, toFlag } from '../../utils/db'
import { fail, ok } from '../../utils/response'

/** 更新角色。 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '更新角色（按 id 定位，只更新传入的字段）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer', description: '角色 ID' },
              name: { type: 'string', description: '角色名称' },
              code: { type: 'string', description: '角色码' },
              description: { type: 'string', description: '角色描述' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              sort: { type: 'integer', description: '排序' },
            },
            required: ['id'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的角色',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleResult' },
          },
        },
      },
    },
  },
})

interface UpdateRoleBody {
  id?: number
  name?: string
  code?: string
  description?: string
  status?: number
  sort?: number
}

export default defineHandler(async (event) => {
  const body = await readBody<UpdateRoleBody>(event).catch(() => ({}) as UpdateRoleBody)

  const id = Number(body.id)
  if (!Number.isFinite(id)) return fail(400, '缺少角色 ID')

  const role = db.roles.find((item) => item.id === id)
  if (!role) return fail(404, '角色不存在')

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail(400, '请输入角色名称')
    role.name = name
  }

  if (body.code !== undefined) {
    const code = String(body.code).trim().toLowerCase()
    if (!/^[a-z][a-z0-9_-]*$/.test(code)) {
      return fail(400, '角色码只允许小写字母开头，后接小写字母 / 数字 / 下划线 / 连字符')
    }
    if (db.roles.some((item) => item.code === code && item.id !== id)) {
      return fail(400, '角色码已存在')
    }
    /*
      内置角色（super / editor / viewer）的 code 不允许改：它是
      「登录账号 → 角色 → 菜单授权」这条链的关联键（见 `menus/navigation.get.ts`），
      改掉之后那三个测试账号会找不到自己的角色。
    */
    if (role.code !== code && ['super', 'editor', 'viewer'].includes(role.code)) {
      return fail(400, '内置角色的角色码不可修改')
    }
    role.code = code
  }

  if (body.description !== undefined) role.description = String(body.description).trim()
  if (body.status !== undefined) role.status = toFlag(body.status, role.status as 1 | 2)
  if (body.sort !== undefined && Number.isFinite(Number(body.sort))) role.sort = Number(body.sort)

  role.updated_at = nowStamp()

  return ok({
    ...role,
    menu_count: db.roleMenus.filter((rm) => rm.role_id === role.id).length,
  })
})
