import { defineHandler, defineRouteMeta } from 'nitro'
import { getHeader, getQuery } from 'nitro/h3'
import {
  DEFAULT_MOCK_ACCOUNT,
  findAccountByToken,
  MOCK_ACCOUNTS,
  type MockRole,
} from '../utils/mock-accounts'
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
 * 模块名与 `feature.ts` 里声明的一致（`table-example` / `dict` / `feature`），
 * 这样「页面能力、页面指令、AI 工具」三处说的是同一套语言。
 *
 * ## Mock 的三种角色
 *
 * 角色**由登录 token 反查**（账号清单在 `../utils/mock-accounts`），
 * 另外支持 `?role=super|editor|viewer` 覆盖 —— 那个口子只给手工验证用：
 * - `super`（`super admin`）：全量读写删改；
 * - `editor`（`admin`）：能建能改、**不能删**；
 * - `viewer`（`user`）：只读。
 *
 * 注意 `Admin` **不是**超管 —— 前端的超管判定只认 `Super Admin`
 * （见 `#/lib/store/permission-store` 的 `computePermissions`），
 * 否则「admin 不能删」会在判定第一道就被短路掉。
 */
const ALL_PERMISSIONS = [
  // 表格示例（模块名与权限 key 统一为 `table-example`）
  'table-example:read',
  'table-example:create',
  'table-example:edit',
  // 更新（直连接口改一条记录）与编辑分开：客户端 UI 不会自动同步
  'table-example:update',
  'table-example:delete',
  // AI 填写表单（只改页面状态、不落库）与提交（落库、不可撤销）分开 —— 风险等级不同
  'table-example:fill',
  'table-example:submit',
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
  /*
    角色管理。
    注意与**菜单可见性**是两层：这里决定「按钮能不能点」，
    角色能看到哪些菜单由 `role_menus` 关联表决定（见 `menus/navigation.get.ts`）。
    Mock 里 Viewer 仍有 `role:read`，但它的菜单授权里没有「角色管理」这一项。
  */
  'role:read',
  'role:create',
  'role:edit',
  'role:delete',
] as const

/** 角色 → 权限点。真实后端由 RBAC 计算，这里只是 Mock 的替身。 */
const ROLE_PERMISSIONS: Record<MockRole, readonly string[]> = {
  super: ALL_PERMISSIONS,
  editor: ALL_PERMISSIONS.filter((p) => !p.endsWith(':delete')),
  viewer: ALL_PERMISSIONS.filter((p) => p.endsWith(':read')),
}

defineRouteMeta({
  openAPI: {
    tags: ['认证'],
    description: '获取当前用户的权限点清单（细到按钮级），供前端在把 AI 工具交给模型前过滤',
    parameters: [
      {
        name: 'role',
        in: 'query',
        required: false,
        description: 'Mock 专用：模拟不同角色（super / editor / viewer），不传优先根据登录 Token 判断',
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
                    description: '权限点，形如 table-example:delete',
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
  const account = findAccountByToken(getHeader(event, 'authorization'))
  const requested = typeof query.role === 'string' ? query.role : ''

  /*
    角色来源优先级：
    1. 登录 token 反查出的账号角色（正常路径 —— 用户是谁，角色就是谁）；
    2. `?role=` 显式覆盖（**只用于手工验证**「换成 viewer 后菜单/工具真的收窄」，
       因为正常情况下前端不会带这个参数）；
    3. 兜底为默认账号的角色（无 token 时保持零配置可进）。
  */
  const role: MockRole =
    account?.role ??
    (requested in ROLE_PERMISSIONS
      ? (requested as MockRole)
      : DEFAULT_MOCK_ACCOUNT.role)

  // 角色展示名从账号清单派生（`role → roleName` 只有一份定义，见 mock-accounts）
  const roleOwner = MOCK_ACCOUNTS.find((item) => item.role === role)

  return ok({
    role: roleOwner?.roleName ?? role,
    permissions: [...ROLE_PERMISSIONS[role]],
  })
})
