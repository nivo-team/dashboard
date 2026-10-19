import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader } from 'nitro/h3'
import { db } from '../../utils/db'
import { isSuperAdminRequest } from '../../utils/mock-accounts'
import { forbidden, notFound, ok } from '../../utils/response'

/** 删除应用（仅超级管理员）。 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '根据应用标识删除应用（仅超级管理员可访问）',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: '应用标识（路由前缀）',
      },
    ],
    responses: {
      200: {
        description: '删除结果',
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

export default defineHandler((event) => {
  if (!isSuperAdminRequest(getHeader(event, 'authorization'))) {
    return forbidden('只有超级管理员可以删除应用')
  }

  const id = String(event.context.params?.id ?? '')
  const app = db.apps.find((item) => item.id === id)
  if (!app) return notFound('应用')

  /*
    不再有「内置应用」这个概念：任何应用都可删。
    单应用模式不走这张表（默认应用由 `VITE_DEFAULT_APP_ID` 决定，`guardAppRoute`
    会自动注入），所以删空列表也不会把单应用模式打挂；多应用模式下删空后
    根路径 `/` 显示空态。
  */
  db.apps = db.apps.filter((item) => item.id !== id)
  return ok(null)
})
