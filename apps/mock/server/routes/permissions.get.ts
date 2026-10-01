import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { ok } from '../utils/response'

/**
 * 当前用户的**权限点清单**（细到按钮级）。
 *
 * ## 为什么需要它
 *
 * AI 工具在执行时用的是**用户自己的登录态**调后端 —— 所以「这个用户能做什么」这件事，
 * 真值在后端，不在前端的偏好设置里。前端拿这份清单只为做一件事：
 * **在把工具交给模型之前先过滤一遍**（没权限的工具干脆不给模型看）。
 *
 * ## 权限点命名
 *
 * `{模块}:{动作}`，动作取 `read` / `create` / `edit` / `delete` / `write`。
 * 模块名与 `feature.ts` 里声明的一致（`user` / `dict` / `feature`），
 * 这样「页面能力、页面指令、AI 工具」三处说的是同一套语言。
 *
 * ## Mock 的三种角色（`?role=`）
 *
 * 真实后端会按登录身份返回；这里用查询参数模拟不同角色，方便验证「权限收窄后 AI
 * 真的拿不到那些工具」：
 * - 不传 / `super`：全量
 * - `editor`：能建能改、**不能删**
 * - `viewer`：只读
 */
const ALL_PERMISSIONS = [
  // 用户运营
  'user:read',
  'user:create',
  'user:edit',
  // 更新（直连接口改一条记录）与编辑分开：客户端 UI 不会自动同步
  'user:update',
  'user:delete',
  // AI 填写表单（只改页面状态、不落库）与提交（落库、不可撤销）分开 —— 风险等级不同
  'user:fill',
  'user:submit',
  // 数据字典
  'dict:read',
  'dict:create',
  'dict:edit',
  'dict:update',
  'dict:delete',
  // 功能菜单
  'feature:read',
  'feature:create',
  'feature:edit',
  'feature:update',
  'feature:delete',
] as const

/** 角色 → 权限点。真实后端由 RBAC 计算，这里只是 Mock 的替身。 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super: ALL_PERMISSIONS,
  editor: ALL_PERMISSIONS.filter((p) => !p.endsWith(':delete')),
  viewer: ALL_PERMISSIONS.filter((p) => p.endsWith(':read')),
}

export type MockRole = keyof typeof ROLE_PERMISSIONS

defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '获取当前用户的权限点清单（细到按钮级），供前端在把 AI 工具交给模型前过滤',
    parameters: [
      {
        name: 'role',
        in: 'query',
        required: false,
        description: 'Mock 专用：模拟不同角色（super / editor / viewer），不传等价于 super',
        schema: { type: 'string' },
      },
    ],
    responses: {
      200: {
        description: '权限点清单',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PermissionsResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          PermissionsResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  role: { type: 'string', description: '角色标识' },
                  permissions: {
                    type: 'array',
                    description: '权限点，形如 user:delete',
                    items: { type: 'string' },
                  },
                },
                required: ['role', 'permissions'],
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
  const requested = typeof query.role === 'string' ? query.role : ''
  const role: MockRole = requested in ROLE_PERMISSIONS ? (requested as MockRole) : 'super'

  return ok({
    role: role === 'super' ? 'Super Admin' : role,
    permissions: [...ROLE_PERMISSIONS[role]],
  })
})
