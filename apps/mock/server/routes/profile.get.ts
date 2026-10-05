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
                  current_region: { type: 'string', description: '当前语言区域' },
                  regions: {
                    type: 'array',
                    description: '有权限的语言区域',
                    items: {
                      type: 'object',
                      properties: {
                        value: { type: 'string', description: '区域值（与 current_region 比较）' },
                        region: { type: 'string', description: '区域标识' },
                        label: { type: 'string', description: '展示名' },
                        disabled: { type: 'boolean', description: '是否禁用' },
                      },
                    },
                  },
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

/** 有权限的语言区域（Mock 里三个账号一致，与语言清单对应）。 */
const MOCK_REGIONS = [
  { value: 'zh-CN', region: 'zh-CN', label: '简体中文', disabled: false },
  { value: 'ar-SA', region: 'ar-SA', label: 'العربية', disabled: false },
]

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
    current_region: 'zh-CN',
    regions: MOCK_REGIONS,
  })
})
