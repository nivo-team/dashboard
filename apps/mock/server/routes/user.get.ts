import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { db } from '../utils/db'
import { ok } from '../utils/response'
import { paginate } from '../utils/query'

/** 用户分页列表。 */
defineRouteMeta({
  openAPI: {
    tags: ['用户'],
    description: '用户分页列表',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' }, description: '页码，从 1 开始' },
      { in: 'query', name: 'page_size', schema: { type: 'integer' }, description: '每页条数' },
      { in: 'query', name: 'kw', schema: { type: 'string' }, description: '关键词（昵称 / 邮箱 / ID）' },
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
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const query = getQuery(event)
  const kw = String(query.kw ?? '').trim().toLowerCase()

  // 关键词同时匹配昵称、邮箱与 ID —— 详情页正是靠 ID 精确定位一条记录的
  const rows = kw
    ? db.users.filter(
        (u) =>
          u.nickname.toLowerCase().includes(kw) ||
          u.email.toLowerCase().includes(kw) ||
          String(u.id).includes(kw),
      )
    : db.users

  return ok(paginate(rows, query))
})
