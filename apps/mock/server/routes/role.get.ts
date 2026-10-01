import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { db, type RoleRow } from '../utils/db'
import { ok } from '../utils/response'
import { paginate } from '../utils/query'

/**
 * 角色分页列表。
 *
 * 角色是 RBAC 的“主体”，菜单授权（`role_menus`）是它的“客体”：
 * 列表里额外返回 `menu_count`，让人一眼看出这个角色配了多少个菜单。
 */
defineRouteMeta({
  openAPI: {
    tags: ['角色'],
    description: '角色分页列表，支持关键词与状态筛选',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' }, description: '页码，从 1 开始' },
      { in: 'query', name: 'page_size', schema: { type: 'integer' }, description: '每页条数' },
      { in: 'query', name: 'kw', schema: { type: 'string' }, description: '关键词（名称 / 角色码 / 描述模糊匹配）' },
      {
        in: 'query',
        name: 'status',
        schema: { type: 'integer', enum: [1, 2] },
        description: '状态：1 启用 / 2 禁用',
      },
    ],
    responses: {
      200: {
        description: '角色分页结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RoleListResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          RoleItem: {
            type: 'object',
            description: '角色',
            properties: {
              id: { type: 'integer', description: '角色 ID' },
              name: { type: 'string', description: '角色名称' },
              code: {
                type: 'string',
                description: '角色码（与登录账号的 role 对应，如 super / editor / viewer）',
              },
              description: { type: 'string', description: '角色描述' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              sort: { type: 'integer', description: '排序' },
              menu_count: { type: 'integer', description: '已授权的菜单数量' },
              created_at: { type: 'string', description: '创建时间' },
              updated_at: { type: 'string', description: '更新时间' },
            },
            required: ['id', 'name', 'code'],
          },
          RoleListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: '总条数' },
                  items: { type: 'array', items: { $ref: '#/components/schemas/RoleItem' } },
                },
                required: ['total', 'items'],
              },
            },
            required: ['code', 'result'],
          },
          RoleResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/RoleItem' },
            },
            required: ['code', 'result'],
          },
          RoleMenusResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  role_id: { type: 'integer', description: '角色 ID' },
                  menu_ids: {
                    type: 'array',
                    description: '该角色已授权的菜单 ID（含目录 / 菜单 / 操作）',
                    items: { type: 'integer' },
                  },
                },
                required: ['role_id', 'menu_ids'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

/** 给角色补上派生的 `menu_count`（本文件内联使用，不作为模块导出——路由文件只应有 default 导出）。 */
function withMenuCount(row: RoleRow) {
  return {
    ...row,
    menu_count: db.roleMenus.filter((rm) => rm.role_id === row.id).length,
  }
}

export default defineHandler((event) => {
  const query = getQuery(event)
  const kw = String(query.kw ?? '').trim().toLowerCase()
  const status = query.status !== undefined && query.status !== '' ? Number(query.status) : undefined

  const rows = db.roles.filter((role) => {
    if (kw) {
      const haystack = `${role.name} ${role.code} ${role.description}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    if (status !== undefined && !Number.isNaN(status) && role.status !== status) return false
    return true
  })

  const paged = paginate(rows, query)
  return ok({
    total: paged.total,
    items: (paged.items as RoleRow[]).map(withMenuCount),
  })
})
