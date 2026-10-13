import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader, getQuery } from 'nitro/h3'
import { db, type AppRow } from '../utils/db'
import { isSuperAdminRequest } from '../utils/mock-accounts'
import { forbidden, ok } from '../utils/response'
import { paginate } from '../utils/query'

/**
 * 应用分页列表（**应用管理模块**，配置视角）。
 *
 * 与 `GET /apps` 的分工：
 * - `GET /apps`：登录后、进入某个应用之前调用的**工作空间列表**（只含启用应用，
 *   不带管理字段，见 `apps.get.ts`）—— 所有登录用户都能拿；
 * - `GET /app`：应用管理用的**配置视角**分页列表（含停用应用与 status / sort / 时间戳）
 *   —— **只给超级管理员**（`app:read` 只有超管持有），非超管返回 403。
 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '应用分页列表（应用管理用，含停用应用与管理字段；仅超级管理员可访问）',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' }, description: '页码，从 1 开始' },
      { in: 'query', name: 'page_size', schema: { type: 'integer' }, description: '每页条数' },
      {
        in: 'query',
        name: 'kw',
        schema: { type: 'string' },
        description: '关键词（应用标识 / 名称 / 副标题 / 分类模糊匹配）',
      },
      {
        in: 'query',
        name: 'status',
        schema: { type: 'integer', enum: [1, 2] },
        description: '状态：1 启用 / 2 禁用',
      },
    ],
    responses: {
      200: {
        description: '应用分页结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManagedAppListResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          ManagedAppItem: {
            type: 'object',
            description: '一个应用（含管理字段）',
            properties: {
              id: {
                type: 'string',
                description: '应用标识：路由前缀与存储作用域，创建后不可修改',
              },
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
              created_at: { type: 'string', description: '创建时间' },
              updated_at: { type: 'string', description: '更新时间' },
            },
            required: ['id', 'name'],
          },
          ManagedAppListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: '总条数' },
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ManagedAppItem' },
                  },
                },
                required: ['total', 'items'],
              },
            },
            required: ['code', 'result'],
          },
          ManagedAppResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/ManagedAppItem' },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  if (!isSuperAdminRequest(getHeader(event, 'authorization'))) {
    return forbidden('应用列表仅超级管理员可访问')
  }

  const query = getQuery(event)
  const kw = String(query.kw ?? '')
    .trim()
    .toLowerCase()
  const status =
    query.status !== undefined && query.status !== '' ? Number(query.status) : undefined

  const rows = db.apps.filter((app) => {
    if (kw) {
      const haystack = `${app.id} ${app.name} ${app.headline} ${app.category}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    if (status !== undefined && !Number.isNaN(status) && app.status !== status) return false
    return true
  })

  const paged = paginate(rows, query)
  return ok({ total: paged.total, items: paged.items as AppRow[] })
})
