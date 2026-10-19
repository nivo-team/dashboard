import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader, readBody } from 'nitro/h3'
import { db, nowStamp, toFlag, type AppRow } from '../../utils/db'
import { isSuperAdminRequest } from '../../utils/mock-accounts'
import { fail, forbidden, ok } from '../../utils/response'

/** 新建应用（仅超级管理员）。 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '新建应用（应用标识即路由前缀，创建后不可修改；仅超级管理员可访问）',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: '应用标识（小写字母开头，后接小写字母 / 数字 / 连字符）',
              },
              name: { type: 'string', description: '应用名称' },
              headline: { type: 'string', description: '副标题' },
              description: { type: 'string', description: '说明文案' },
              domain: { type: 'string', description: '展示用域名（不带协议）' },
              apiBaseUrl: { type: 'string', description: '该应用的接口根地址' },
              badge: { type: 'string', description: '角标文案' },
              category: { type: 'string', description: '所属分类' },
              themeGradient: { type: 'string', description: '卡片渐变色（Tailwind 类名）' },
              status: { type: 'integer', description: '1 启用 / 2 禁用，默认 1' },
              sort: { type: 'integer', description: '排序' },
            },
            required: ['id', 'name'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的应用',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManagedAppResult' },
          },
        },
      },
    },
  },
})

interface CreateAppBody {
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
    return forbidden('只有超级管理员可以新建应用')
  }

  const body = ((await readBody<CreateAppBody>(event).catch(() => undefined)) ??
    {}) as CreateAppBody

  // 应用标识会直接进 URL（`/$appId/...`）与存储作用域，必须收紧到 URL 安全字符集
  const id = String(body.id ?? '')
    .trim()
    .toLowerCase()
  const name = String(body.name ?? '').trim()

  if (!id) return fail(400, '请输入应用标识')
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
    return fail(400, '应用标识只允许小写字母开头，后接小写字母 / 数字 / 连字符，长度 2-32')
  }
  if (!name) return fail(400, '请输入应用名称')
  if (db.apps.some((app) => app.id === id)) return fail(400, '应用标识已存在')

  const ts = nowStamp()
  const app: AppRow = {
    id,
    name,
    headline: String(body.headline ?? '').trim(),
    description: String(body.description ?? '').trim(),
    domain: String(body.domain ?? '').trim(),
    apiBaseUrl: String(body.apiBaseUrl ?? '').trim(),
    badge: String(body.badge ?? '').trim(),
    category: String(body.category ?? '').trim(),
    themeGradient: String(body.themeGradient ?? '').trim(),
    status: toFlag(body.status, 1),
    sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : db.apps.length + 1,
    created_at: ts,
    updated_at: ts,
  }

  db.apps.push(app)
  return ok(app)
})
