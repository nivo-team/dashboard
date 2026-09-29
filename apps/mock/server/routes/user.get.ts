import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { db } from '../utils/db'
import { ok } from '../utils/response'
import { paginate } from '../utils/query'

/** 用户分页列表。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '用户分页列表，支持关键词、多字段精确/范围筛选与服务端排序',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' }, description: '页码，从 1 开始' },
      { in: 'query', name: 'page_size', schema: { type: 'integer' }, description: '每页条数' },
      { in: 'query', name: 'kw', schema: { type: 'string' }, description: '关键词（昵称 / 邮箱 / ID 模糊匹配）' },
      {
        in: 'query',
        name: 'field',
        schema: {
          type: 'string',
          enum: ['id', 'nickname', 'email', 'createtime', 'logintime'],
        },
        description: '排序字段名',
      },
      {
        in: 'query',
        name: 'order',
        schema: {
          type: 'string',
          enum: ['asc', 'desc'],
        },
        description: '排序方向',
      },
      { in: 'query', name: 'id', schema: { type: 'integer' }, description: '用户 ID 精确匹配' },
      { in: 'query', name: 'nickname', schema: { type: 'string' }, description: '昵称模糊匹配' },
      { in: 'query', name: 'email', schema: { type: 'string' }, description: '邮箱模糊匹配' },
      { in: 'query', name: 'createtime_min', schema: { type: 'integer' }, description: '注册时间下限（秒级时间戳）' },
      { in: 'query', name: 'createtime_max', schema: { type: 'integer' }, description: '注册时间上限（秒级时间戳）' },
      { in: 'query', name: 'logintime_min', schema: { type: 'integer' }, description: '最后登录时间下限（秒级时间戳）' },
      { in: 'query', name: 'logintime_max', schema: { type: 'integer' }, description: '最后登录时间上限（秒级时间戳）' },
    ],
    responses: {
      200: {
        description: '用户分页结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserListResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          UserItem: {
            type: 'object',
            description: '用户列表行',
            properties: {
              id: { type: 'integer', description: '用户 ID' },
              nickname: { type: 'string', description: '昵称' },
              avatar_url: { type: 'string', description: '头像地址' },
              email: { type: 'string', description: '邮箱' },
              createtime: { type: 'integer', description: '注册时间（秒级时间戳）' },
              logintime: { type: 'integer', description: '最近登录时间（秒级时间戳）' },
            },
            required: ['id', 'nickname'],
          },
          UserListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: '总条数' },
                  items: { type: 'array', items: { $ref: '#/components/schemas/UserItem' } },
                },
                required: ['total', 'items'],
              },
            },
            required: ['code', 'result'],
          },
          UserResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/UserItem' },
            },
            required: ['code', 'result'],
          },
          BatchDeleteResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  deleted_count: { type: 'integer', description: '成功删除数量' },
                },
                required: ['deleted_count'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const query = getQuery(event)
  const kw = String(query.kw ?? '').trim().toLowerCase()
  const filterId = query.id !== undefined && query.id !== '' ? Number(query.id) : undefined
  const filterNickname = String(query.nickname ?? '').trim().toLowerCase()
  const filterEmail = String(query.email ?? '').trim().toLowerCase()
  const createMin = query.createtime_min !== undefined && query.createtime_min !== '' ? Number(query.createtime_min) : undefined
  const createMax = query.createtime_max !== undefined && query.createtime_max !== '' ? Number(query.createtime_max) : undefined
  const loginMin = query.logintime_min !== undefined && query.logintime_min !== '' ? Number(query.logintime_min) : undefined
  const loginMax = query.logintime_max !== undefined && query.logintime_max !== '' ? Number(query.logintime_max) : undefined

  let rows = db.users.filter((u) => {
    if (kw && !(u.nickname.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw) || String(u.id).includes(kw))) {
      return false
    }
    if (filterId !== undefined && !Number.isNaN(filterId) && u.id !== filterId) {
      return false
    }
    if (filterNickname && !u.nickname.toLowerCase().includes(filterNickname)) {
      return false
    }
    if (filterEmail && !u.email.toLowerCase().includes(filterEmail)) {
      return false
    }
    if (createMin !== undefined && !Number.isNaN(createMin) && u.createtime < createMin) {
      return false
    }
    if (createMax !== undefined && !Number.isNaN(createMax) && u.createtime > createMax) {
      return false
    }
    if (loginMin !== undefined && !Number.isNaN(loginMin) && u.logintime < loginMin) {
      return false
    }
    if (loginMax !== undefined && !Number.isNaN(loginMax) && u.logintime > loginMax) {
      return false
    }
    return true
  })

  // 排序
  const field = String(query.field ?? '').trim() as keyof (typeof rows)[number]
  const order = String(query.order ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
  if (field && ['id', 'nickname', 'email', 'createtime', 'logintime'].includes(field)) {
    rows = [...rows].sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (typeof va === 'string' && typeof vb === 'string') {
        return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return order === 'asc' ? (Number(va) - Number(vb)) : (Number(vb) - Number(va))
    })
  }

  return ok(paginate(rows, query))
})
