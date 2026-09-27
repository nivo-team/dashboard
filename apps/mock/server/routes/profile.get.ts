import { defineHandler, defineRouteMeta } from 'nitro'
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

export default defineHandler(() =>
  ok({
    uid: 1,
    username: 'admin',
    nick_name: '超级管理员',
    email: 'admin@example.com',
    role: 'Super Admin',
    status: 1,
    current_region: 'zh-CN',
    regions: [
      { value: 'zh-CN', region: 'zh-CN', label: '简体中文', disabled: false },
      { value: 'en-US', region: 'en-US', label: 'English', disabled: false },
      { value: 'ja-JP', region: 'ja-JP', label: '日本語', disabled: false },
    ],
  }),
)
