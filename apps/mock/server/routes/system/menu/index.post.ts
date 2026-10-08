import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nextId, nowStamp, toFlag } from '../../../utils/db'
import { fail, ok } from '../../../utils/response'

/**
 * 新建功能组 / 功能 / 权限点。
 *
 * `path` 与 `component` 允许省略 —— 旧后端把这两个字段设为必填，逼得前端
 * 到处填 `/ignore` 占位；Mock 不校验它们，模板里也就不需要那套占位常量。
 */
defineRouteMeta({
  openAPI: {
    tags: ['功能菜单'],
    description: '新建功能 / 功能组 / 权限点',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/MenuCreateBody' },
        },
      },
    },
    responses: {
      200: {
        description: '新建的功能节点',
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
          MenuCreateBody: {
            type: 'object',
            properties: {
              menu_name: { type: 'string', description: '功能名称' },
              parent_id: { type: 'integer', description: '上级功能 ID，顶级为 0' },
              menu_type: { type: 'integer', description: '1 功能组 / 2 功能 / 3 操作' },
              path: { type: 'string', description: '路由地址（可省略）' },
              component: { type: 'string', description: '前端组件（可省略）' },
              route_name: { type: 'string' },
              permission: { type: 'string', description: '权限标识' },
              icon: { type: 'string' },
              sort: { type: 'integer' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              visible: { type: 'integer', description: '1 可见 / 2 隐藏' },
              is_frame: { type: 'integer' },
              no_cache: { type: 'integer' },
              api_keys: { type: 'array', items: { type: 'string' } },
            },
            required: ['menu_name', 'menu_type'],
          },
          MenuNodeResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/MenuNode' },
            },
            required: ['code'],
          },
        },
      },
    },
  },
})

interface MenuBody {
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
  const body = ((await readBody<MenuBody>(event).catch(() => undefined)) ?? {}) as MenuBody

  const name = body?.menu_name?.trim()
  if (!name) return fail(400, '请输入功能名称')

  const parentId = Number(body.parent_id) || 0
  if (parentId !== 0 && !db.menus.some((m) => m.menu_id === parentId)) {
    return fail(400, '上级功能不存在')
  }

  const ts = nowStamp()
  const row = {
    menu_id: nextId('menu'),
    parent_id: parentId,
    menu_name: name,
    menu_type: Number(body.menu_type) || 2,
    // 省略即留空：功能组不参与前端路由，没有必要硬塞占位值
    path: body.path?.trim() || '',
    component: body.component?.trim() || '',
    route_name: body.route_name?.trim() || '',
    permission: body.permission?.trim() || '',
    icon: body.icon?.trim() || '',
    sort: Number(body.sort) || 0,
    status: toFlag(body.status, 1),
    visible: toFlag(body.visible, 1),
    is_frame: toFlag(body.is_frame, 2),
    no_cache: toFlag(body.no_cache, 1),
    api_keys: Array.isArray(body.api_keys) ? body.api_keys : [],
    created_at: ts,
    updated_at: ts,
  }

  db.menus.push(row)
  return ok({ ...row, children: [] })
})
