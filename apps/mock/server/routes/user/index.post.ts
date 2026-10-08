import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nextId, nowSeconds, type UserRow } from '../../utils/db'
import { fail, ok } from '../../utils/response'

/** 新建用户。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '新建用户',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              nickname: { type: 'string', description: '用户昵称' },
              email: { type: 'string', description: '用户邮箱' },
              avatar_url: { type: 'string', description: '头像 URL' },
            },
            required: ['nickname'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的用户详情',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserResult' },
          },
        },
      },
    },
  },
})

interface CreateUserBody {
  nickname?: string
  email?: string
  avatar_url?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<CreateUserBody>(event).catch(() => undefined)) ??
    {}) as CreateUserBody
  const nickname = String(body.nickname ?? '').trim()
  if (!nickname) return fail(400, '请输入用户昵称')

  const ts = nowSeconds()
  const newUser: UserRow = {
    id: nextId('user'),
    nickname,
    email: String(body.email ?? '').trim(),
    avatar_url: String(body.avatar_url ?? '').trim(),
    createtime: ts,
    logintime: ts,
  }

  db.users.unshift(newUser)
  return ok(newUser)
})
