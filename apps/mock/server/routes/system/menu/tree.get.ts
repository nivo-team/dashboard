import { defineHandler, defineRouteMeta } from 'nitro'
import { db, menuTree } from '../../../utils/db'
import { readNumber } from '../../../utils/query'
import { ok } from '../../../utils/response'

/**
 * 功能菜单树。
 *
 * 返回**顶层节点数组**，后代嵌套在各自的 `children` 里（前端容器视图、详情视图
 * 与创建表单都从这一棵树上派生）。
 *
 * `menu_id` 参数向后兼容保留：旧实现要求必须传一个新架构根节点 id，
 * 不传会拖出整棵历史菜单树。这里语义更简单 —— 传了就返回该节点的子树，
 * 不认识或没传就返回整棵树。
 */
defineRouteMeta({
  openAPI: {
    tags: ['功能菜单'],
    description: '获取功能菜单树（顶层节点数组，后代嵌在 children 中）',
    parameters: [
      {
        in: 'query',
        name: 'menu_id',
        schema: { type: 'integer' },
        description: '以某个节点为根的子树；不传或传入未知 id 时返回整棵树',
      },
    ],
    responses: {
      200: {
        description: '功能树',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/MenuTreeResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          MenuNode: {
            type: 'object',
            description: '功能节点（可嵌套）',
            properties: {
              menu_id: { type: 'integer', description: '功能 ID' },
              parent_id: { type: 'integer', description: '上级功能 ID，顶级为 0' },
              menu_name: { type: 'string', description: '功能名称' },
              menu_type: { type: 'integer', description: '1 功能组 / 2 功能 / 3 操作' },
              path: { type: 'string', description: '路由地址' },
              component: { type: 'string', description: '前端组件' },
              route_name: { type: 'string', description: '路由名称' },
              permission: { type: 'string', description: '权限标识' },
              icon: { type: 'string', description: '图标标识' },
              sort: { type: 'integer', description: '排序' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              visible: { type: 'integer', description: '1 可见 / 2 隐藏' },
              is_frame: { type: 'integer', description: '1 是外链 / 2 否' },
              no_cache: { type: 'integer', description: '1 不缓存 / 2 缓存' },
              id_path: { type: 'string', description: '祖先 id 链（不含自身）' },
              api_keys: {
                type: 'array',
                description: '关联的接口标识（取自系统接口清单的 value）',
                items: { type: 'string' },
              },
              created_at: { type: 'string', description: '创建时间' },
              updated_at: { type: 'string', description: '更新时间' },
              children: {
                type: 'array',
                description: '子功能',
                items: { $ref: '#/components/schemas/MenuNode' },
              },
            },
            required: ['menu_id', 'menu_name', 'menu_type'],
          },
          MenuTreeResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { type: 'array', items: { $ref: '#/components/schemas/MenuNode' } },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const requested = readNumber(event, 'menu_id')
  const known = requested !== undefined && db.menus.some((m) => m.menu_id === requested)
  return ok(menuTree(known ? (requested as number) : 0))
})
