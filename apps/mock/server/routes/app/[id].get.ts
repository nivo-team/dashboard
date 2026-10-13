import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader } from 'nitro/h3'
import { db } from '../../utils/db'
import { isSuperAdminRequest } from '../../utils/mock-accounts'
import { forbidden, notFound, ok } from '../../utils/response'

/** 应用详情（应用管理页的编辑态用；仅超级管理员可访问）。 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '根据应用标识获取详情（仅超级管理员可访问）',
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
        description: '应用详情',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManagedAppResult' },
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  if (!isSuperAdminRequest(getHeader(event, 'authorization'))) {
    return forbidden('应用详情仅超级管理员可访问')
  }

  const id = String(event.context.params?.id ?? '')
  const app = db.apps.find((item) => item.id === id)
  if (!app) return notFound('应用')
  return ok(app)
})
