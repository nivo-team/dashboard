import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { fail, ok } from '../utils/response'

/**
 * 登录。
 *
 * 任意「非空账号 + 非空密码」都通过 —— 开源模板要的是**零配置能进系统**，
 * 而不是复刻真实的账号体系。返回结构与真实后端一致（`result.token` /
 * `result.uid`），因此前端登录逻辑一行都不用改。
 */
defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '账号密码登录（任意非空账号密码均可通过）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', description: '账号' },
              password: { type: 'string', description: '密码' },
              remember: { type: 'boolean', description: '是否记住登录状态' },
            },
            required: ['username', 'password'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '登录结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          LoginResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  token: { type: 'string', description: '访问令牌' },
                  refresh_token: { type: 'string', description: '刷新令牌' },
                  token_expire: { type: 'integer', description: '访问令牌过期时间（秒级时间戳）' },
                  refresh_token_expire: { type: 'integer', description: '刷新令牌过期时间' },
                  uid: { type: 'integer', description: '用户 ID' },
                },
                required: ['token', 'uid'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

interface LoginBody {
  username?: string
  password?: string
}

export default defineHandler(async (event) => {
  const body = await readBody<LoginBody>(event).catch(() => ({}) as LoginBody)

  if (!body?.username?.trim()) return fail(400, '请输入账号')
  if (!body?.password?.trim()) return fail(400, '请输入密码')

  return ok({
    token: 'mock-token',
    refresh_token: 'mock-refresh-token',
    // 给一个远期时间，避免演示到一半 token 过期
    token_expire: 4102444800,
    refresh_token_expire: 4102444800,
    uid: 1,
  })
})
