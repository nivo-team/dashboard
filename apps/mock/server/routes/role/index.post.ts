import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nextId, nowStamp, toFlag, type RoleRow } from '../../utils/db'
import { fail, ok } from '../../utils/response'

/** 新建角色。 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '新建角色',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '角色名称' },
              code: { type: 'string', description: '角色码（小写字母 / 数字 / _ / -）' },
              description: { type: 'string', description: '角色描述' },
              status: { type: 'integer', description: '1 启用 / 2 禁用，默认 1' },
              sort: { type: 'integer', description: '排序' },
            },
            required: ['name', 'code'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的角色',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleResult' },
          },
        },
      },
    },
  },
})

interface CreateRoleBody {
  name?: string
  code?: string
  description?: string
  status?: number
  sort?: number
}

export default defineHandler(async (event) => {
  const body = ((await readBody<CreateRoleBody>(event).catch(() => undefined)) ??
    {}) as CreateRoleBody

  const name = String(body.name ?? '').trim()
  const code = String(body.code ?? '')
    .trim()
    .toLowerCase()

  if (!name) return fail(400, '请输入角色名称')
  if (!code) return fail(400, '请输入角色码')
  if (!/^[a-z][a-z0-9_-]*$/.test(code)) {
    return fail(400, '角色码只允许小写字母开头，后接小写字母 / 数字 / 下划线 / 连字符')
  }
  if (db.roles.some((role) => role.code === code)) return fail(400, '角色码已存在')

  const ts = nowStamp()
  const role: RoleRow = {
    id: nextId('role'),
    name,
    code,
    description: String(body.description ?? '').trim(),
    status: toFlag(body.status, 1),
    sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : db.roles.length + 1,
    created_at: ts,
    updated_at: ts,
  }

  db.roles.push(role)
  // 新角色默认不授权任何菜单：菜单授权走 `PUT /role/menus`
  return ok({ ...role, menu_count: 0 })
})
