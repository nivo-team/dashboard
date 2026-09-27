import { defineHandler, defineRouteMeta } from 'nitro'
import { ok } from '../utils/response'

/**
 * 退出登录。
 *
 * Mock 不维护服务端会话，因此这里只做「确认收到」—— 前端的登出流程
 * （清本地凭据、清各应用查询缓存、回到登录页）本来就都在客户端完成。
 */
defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '退出登录',
    responses: {
      200: {
        description: '退出结果',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'integer', description: '0 表示成功' },
                message: { type: 'string' },
                result: { type: 'null', description: '成功时为空' },
              },
              required: ['code'],
            },
          },
        },
      },
    },
  },
})

export default defineHandler(() => ok(null))
