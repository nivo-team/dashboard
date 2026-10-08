import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader } from 'nitro/h3'
import { db, menuIdsOfRole, visibleMenuTree, type MenuRow } from '../../utils/db'
import { DEFAULT_MOCK_ACCOUNT, findAccountByToken } from '../../utils/mock-accounts'
import { ok } from '../../utils/response'

/**
 * **导航菜单树**（当前登录用户可见）。
 *
 * 与 `GET /system/menu/tree` 的分工：
 * - `tree`：**配置视角** —— 菜单管理页面用的全量树（含操作节点），管理员配置菜单时看它；
 * - 本接口：**使用视角** —— 按当前用户的角色裁剪后的树，只含能落地的目录(1)/菜单(2)，
 *   供导航渲染。
 *
 * 身份链：`Authorization` token → 账号（`mock-accounts`）→ 账号的 `role` 码 →
 * 角色（`db.roles.code`）→ `role_menus` 授权 → 菜单树。
 * 注意 `menu_type = 3`（操作/权限点）**不进导航**：它们是按钮级权限，不是页面。
 */
defineRouteMeta({
  openAPI: {
    tags: ['菜单'],
    description: '当前登录用户可见的导航菜单树（按角色菜单授权过滤，只含目录与菜单）',
    responses: {
      200: {
        description: '导航菜单树',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NavigationResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          NavigationNode: {
            type: 'object',
            description: '导航节点（目录 / 菜单，可嵌套）',
            properties: {
              menu_id: { type: 'integer', description: '菜单 ID' },
              parent_id: { type: 'integer', description: '上级菜单 ID，顶级为 0' },
              menu_name: { type: 'string', description: '菜单名称' },
              menu_type: { type: 'integer', description: '1 目录 / 2 菜单' },
              path: {
                type: 'string',
                description: '路由地址（相对 appId），打开该菜单落到这个前端路由',
              },
              icon: { type: 'string', description: '图标标识' },
              sort: { type: 'integer', description: '排序' },
              visible: { type: 'integer', description: '1 可见 / 2 隐藏' },
              children: {
                type: 'array',
                description: '子菜单',
                items: { $ref: '#/components/schemas/NavigationNode' },
              },
            },
            required: ['menu_id', 'menu_name', 'menu_type'],
          },
          NavigationResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  role: {
                    type: 'object',
                    description: '解析出的当前角色（导航裁剪依据）',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      code: { type: 'string' },
                    },
                    required: ['id', 'name', 'code'],
                  },
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/NavigationNode' },
                  },
                },
                required: ['role', 'items'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

interface NavigationNode {
  menu_id: number
  parent_id: number
  menu_name: string
  menu_type: number
  path: string
  icon: string
  sort: number
  visible: number
  children: NavigationNode[]
}

/** 把菜单行裁成导航节点：丢掉操作节点，只留导航需要的字段。 */
function toNavigationNodes(nodes: Array<MenuRow & { children: unknown[] }>): NavigationNode[] {
  return nodes
    .filter((node) => node.menu_type !== 3)
    .map((node) => ({
      menu_id: node.menu_id,
      parent_id: node.parent_id,
      menu_name: node.menu_name,
      menu_type: node.menu_type,
      path: node.path,
      icon: node.icon,
      sort: node.sort,
      visible: node.visible,
      children: toNavigationNodes(
        (node.children ?? []) as Array<MenuRow & { children: unknown[] }>,
      ),
    }))
}

export default defineHandler((event) => {
  // 无 token / 未知 token → 兜底账号（与 profile 一致，保持「零配置能进」）
  const account = findAccountByToken(getHeader(event, 'authorization')) ?? DEFAULT_MOCK_ACCOUNT
  const role = db.roles.find((item) => item.code === account.role) ?? db.roles[0]

  const visibleIds = menuIdsOfRole(role.id)
  const items = toNavigationNodes(visibleMenuTree(visibleIds))

  return ok({
    role: { id: role.id, name: role.name, code: role.code },
    items,
  })
})
