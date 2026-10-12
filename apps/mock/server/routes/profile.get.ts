import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader } from 'nitro/h3'
import { DEFAULT_MOCK_ACCOUNT, findAccountByToken } from '../utils/mock-accounts'
import { ok } from '../utils/response'

/** 当前登录用户信息。 */
defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '获取当前登录用户信息',
    responses: {
      200: {
        description: '用户信息',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProfileResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          ProfileResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  uid: { type: 'integer' },
                  username: { type: 'string', description: '登录账号' },
                  nick_name: { type: 'string', description: '昵称' },
                  email: { type: 'string' },
                  role: { type: 'string', description: '角色名' },
                  status: { type: 'integer', description: '1 正常 / 2 停用' },
                },
                required: ['uid', 'username'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

/**
 * 按登录 token 返回对应账号的信息。
 *
 * 身份真值在 `../utils/mock-accounts`：这里以前用 `token.includes('user')` 之类的
 * 子串猜测拼三份硬编码对象，加账号必漏改（而且 `mock-token-super` 恰好不含 `user`／
 * 含 `admin`，判断全靠 token 命名巧合）。
 */
export default defineHandler((event) => {
  // 无 token / 未知 token → 兜底账号（保持「零配置能进系统」）
  const account = findAccountByToken(getHeader(event, 'authorization')) ?? DEFAULT_MOCK_ACCOUNT

  return ok({
    uid: account.uid,
    username: account.username,
    nick_name: account.nickName,
    email: account.email,
    role: account.roleName,
    status: 1,
  })
})
