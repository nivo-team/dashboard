import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db } from '../../../utils/db'
import { fail, notFound, ok } from '../../../utils/response'

/** 更新用户。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '更新用户信息',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer', description: '用户 ID' },
              nickname: { type: 'string', description: '用户昵称' },
              email: { type: 'string', description: '用户邮箱' },
              avatar_url: { type: 'string', description: '头像 URL' },
            },
            required: ['id'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的用户详情',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserResult' },
          },
        },
      },
    },
  },
})

interface UpdateUserBody {
  id?: number
  nickname?: string
  email?: string
  avatar_url?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<UpdateUserBody>(event).catch(() => undefined)) ??
    {}) as UpdateUserBody
  const id = Number(body?.id)
  if (!id) return fail(400, '用户 ID 不能为空')

  const user = db.users.find((u) => u.id === id)
  if (!user) return notFound('用户')

  if (body.nickname !== undefined) {
    const nick = String(body.nickname).trim()
    if (!nick) return fail(400, '用户昵称不能为空')
    user.nickname = nick
  }

  if (body.email !== undefined) {
    user.email = String(body.email).trim()
  }

  if (body.avatar_url !== undefined) {
    user.avatar_url = String(body.avatar_url).trim()
  }

  return ok(user)
})
