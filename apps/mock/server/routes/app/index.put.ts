import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader, readBody } from 'nitro/h3'
import { db, nowStamp, toFlag } from '../../utils/db'
import { isSuperAdminRequest } from '../../utils/mock-accounts'
import { fail, forbidden, ok } from '../../utils/response'

/** 更新应用（按应用标识定位，只更新传入的字段；仅超级管理员）。 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '更新应用（应用标识不可修改；仅超级管理员可访问）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '应用标识（定位用，不可修改）' },
              name: { type: 'string', description: '应用名称' },
              headline: { type: 'string', description: '副标题' },
              description: { type: 'string', description: '说明文案' },
              domain: { type: 'string', description: '展示用域名（不带协议）' },
              apiBaseUrl: { type: 'string', description: '该应用的接口根地址' },
              badge: { type: 'string', description: '角标文案' },
              category: { type: 'string', description: '所属分类' },
              themeGradient: { type: 'string', description: '卡片渐变色（Tailwind 类名）' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              sort: { type: 'integer', description: '排序' },
            },
            required: ['id'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的应用',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManagedAppResult' },
          },
        },
      },
    },
  },
})

interface UpdateAppBody {
  id?: string
  name?: string
  headline?: string
  description?: string
  domain?: string
  apiBaseUrl?: string
  badge?: string
  category?: string
  themeGradient?: string
  status?: number
  sort?: number
}

export default defineHandler(async (event) => {
  if (!isSuperAdminRequest(getHeader(event, 'authorization'))) {
    return forbidden('只有超级管理员可以修改应用')
  }

  const body = ((await readBody<UpdateAppBody>(event).catch(() => undefined)) ??
    {}) as UpdateAppBody

  const id = String(body.id ?? '').trim()
  if (!id) return fail(400, '缺少应用标识')

  const app = db.apps.find((item) => item.id === id)
  if (!app) return fail(404, '应用不存在')

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail(400, '请输入应用名称')
    app.name = name
  }
  if (body.headline !== undefined) app.headline = String(body.headline).trim()
  if (body.description !== undefined) app.description = String(body.description).trim()
  if (body.domain !== undefined) app.domain = String(body.domain).trim()
  if (body.apiBaseUrl !== undefined) app.apiBaseUrl = String(body.apiBaseUrl).trim()
  if (body.badge !== undefined) app.badge = String(body.badge).trim()
  if (body.category !== undefined) app.category = String(body.category).trim()
  if (body.themeGradient !== undefined) app.themeGradient = String(body.themeGradient).trim()
  if (body.status !== undefined) app.status = toFlag(body.status, app.status as 1 | 2)
  if (body.sort !== undefined && Number.isFinite(Number(body.sort))) app.sort = Number(body.sort)

  app.updated_at = nowStamp()
  return ok(app)
})
