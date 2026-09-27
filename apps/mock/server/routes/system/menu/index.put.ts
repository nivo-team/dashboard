import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nowStamp, toFlag } from '../../../utils/db'
import { fail, notFound, ok } from '../../../utils/response'

/** 更新功能节点。 */
defineRouteMeta({
  openAPI: {
    tags: ['功能菜单'],
    description: '更新功能 / 功能组 / 权限点',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/MenuUpdateBody' },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的功能节点',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/MenuNodeResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          MenuUpdateBody: {
            type: 'object',
            description: '在新建请求体基础上必须带 menu_id',
            properties: {
              menu_id: { type: 'integer', description: '功能 ID' },
              menu_name: { type: 'string' },
              parent_id: { type: 'integer' },
              menu_type: { type: 'integer' },
              path: { type: 'string' },
              component: { type: 'string' },
              route_name: { type: 'string' },
              permission: { type: 'string' },
              icon: { type: 'string' },
              sort: { type: 'integer' },
              status: { type: 'integer' },
              visible: { type: 'integer' },
              is_frame: { type: 'integer' },
              no_cache: { type: 'integer' },
              api_keys: { type: 'array', items: { type: 'string' } },
            },
            required: ['menu_id'],
          },
        },
      },
    },
  },
})

interface MenuUpdateBody {
  menu_id?: number
  menu_name?: string
  parent_id?: number
  menu_type?: number
  path?: string
  component?: string
  route_name?: string
  permission?: string
  icon?: string
  sort?: number
  status?: number
  visible?: number
  is_frame?: number
  no_cache?: number
  api_keys?: string[]
}

export default defineHandler(async (event) => {
  const body = await readBody<MenuUpdateBody>(event).catch(() => ({}) as MenuUpdateBody)

  const id = Number(body?.menu_id)
  const row = db.menus.find((m) => m.menu_id === id)
  if (!row) return notFound('功能')

  // 不允许把节点挂到自己身上（否则树会成环）
  const parentId = body.parent_id === undefined ? row.parent_id : Number(body.parent_id) || 0
  if (parentId === id) return fail(400, '上级功能不能是自己')

  if (body.menu_name !== undefined) {
    const name = String(body.menu_name).trim()
    if (!name) return fail(400, '请输入功能名称')
    row.menu_name = name
  }
  row.parent_id = parentId
  if (body.menu_type !== undefined) row.menu_type = Number(body.menu_type) || row.menu_type
  if (body.path !== undefined) row.path = String(body.path).trim()
  if (body.component !== undefined) row.component = String(body.component).trim()
  if (body.route_name !== undefined) row.route_name = String(body.route_name).trim()
  if (body.permission !== undefined) row.permission = String(body.permission).trim()
  if (body.icon !== undefined) row.icon = String(body.icon).trim()
  if (body.sort !== undefined) row.sort = Number(body.sort) || 0
  if (body.status !== undefined) row.status = toFlag(body.status, 1)
  if (body.visible !== undefined) row.visible = toFlag(body.visible, 1)
  if (body.is_frame !== undefined) row.is_frame = toFlag(body.is_frame, 2)
  if (body.no_cache !== undefined) row.no_cache = toFlag(body.no_cache, 1)
  if (Array.isArray(body.api_keys)) row.api_keys = body.api_keys
  row.updated_at = nowStamp()

  return ok({ ...row, children: [] })
})
