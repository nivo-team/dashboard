import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { findAccountByUsername } from '../utils/mock-accounts'
import { fail, ok } from '../utils/response'

/**
 * 登录（Mock）。
 *
 * 只认三个预设测试账号，密码统一 `123`（真实项目里当然不是这样，这里是
 * **为了让「角色 → 权限」的收敛链可验证**才刻意收紧的）：
 * 1. `super admin`：最高权限（全量读写删改）；
 * 2. `admin`：业务管理员（能建能改，**不能删**）；
 * 3. `user`：普通访客（只读）。
 *
 * 账号清单本身在 `../utils/mock-accounts`：`permissions.get.ts` 与 `profile.get.ts`
 * 也按同一份清单反查身份，避免三处各写一份角色表而漂移。
 */

defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '账号密码登录（验证预设测试账号：super admin / admin / user）',
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

  const rawUsername = body?.username?.trim()
  const rawPassword = body?.password?.trim()

  if (!rawUsername) return fail(400, '请输入账号')
  if (!rawPassword) return fail(400, '请输入密码')

  const matched = findAccountByUsername(rawUsername)

  if (!matched) {
    return fail(400, '账号不存在（测试账号：super admin / admin / user）')
  }

  /*
    密码**只与账号自己的 password 比**。
    这里以前还接受「账号名当密码」「别名当密码」等一堆兜底 —— 那些既让「密码错误」
    这条分支永远测不到，也把 `aliases`（登录名）误当成密码来源，属于纯粹的语义错误。
  */
  if (rawPassword !== matched.password) {
    return fail(400, `密码错误（测试账号默认密码：${matched.password}）`)
  }

  return ok({
    token: matched.token,
    refresh_token: `${matched.token}-refresh`,
    // 给一个远期时间，避免演示到一半 token 过期
    token_expire: 4102444800,
    refresh_token_expire: 4102444800,
    uid: matched.uid,
  })
})
