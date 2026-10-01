import type { RoleItem } from '#/api'
import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 角色管理**列表**页的特性声明（`/$appId/system/roles`）。
 *
 * 暴露角色数据源与重新取数；写入口（新建弹窗、行内删除）的状态在页面内部，
 * 因此不声明 `commands` —— 声明一条拿不到句柄的指令，只会变成「AI 说删了、其实没发生」。
 */
export interface RoleListFeatureOptions {
  roles: readonly RoleItem[]
  loading: boolean
  reload: () => Promise<unknown> | unknown
}

export function createRoleListFeature(options: RoleListFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '角色管理列表',
    description:
      '分页浏览角色（名称 / 角色码 / 描述 / 状态 / 已授权菜单数）；可新建角色、点名称或行进入详情页编辑并分配可见菜单、删除角色。',
    entities: ['角色', '角色码', '菜单授权'],
    /*
      权限点按 `{模块}:{动作}` 细分，模块名与后端权限清单一致（`role`）。
      判定只在 `hasPageCapabilityPermission` 一处（见 permissions-architecture.md）。
    */
    permissions: ['role:read', 'role:create', 'role:edit', 'role:delete'],
    endpoints: [
      { method: 'GET', path: '/role', permission: 'role:read', purpose: '角色分页列表（支持 kw 关键词）' },
      { method: 'POST', path: '/role', permission: 'role:create', purpose: '新建角色' },
      { method: 'PUT', path: '/role', permission: 'role:edit', purpose: '更新角色（在详情页提交）' },
      {
        method: 'DELETE',
        path: '/role/{id}',
        permission: 'role:delete',
        purpose: '删除角色，并清理它的菜单授权（内置角色不可删）',
      },
      {
        method: 'GET',
        path: '/role/menus',
        permission: 'role:read',
        purpose: '查询某角色已授权的菜单 ID',
      },
      {
        method: 'PUT',
        path: '/role/menus',
        permission: 'role:edit',
        purpose: '替换角色的菜单授权（全量覆盖）',
      },
    ],
    dataSources: [
      {
        id: 'roles',
        title: '角色列表（当前页）',
        description: '这一页表格里的角色',
        shape:
          '每行：id / name / code / description / status（1 启用 2 禁用）/ sort / menu_count / created_at',
        fields: [
          { name: 'id', label: '角色 ID', type: 'number' },
          { name: 'name', label: '角色名称', type: 'string' },
          {
            name: 'code',
            label: '角色码',
            type: 'string',
            description: '登录账号按它关联角色，内置角色的角色码不可改',
          },
          { name: 'description', label: '描述', type: 'string' },
          {
            name: 'status',
            label: '状态',
            type: 'enum',
            options: [
              { value: 1, label: '启用' },
              { value: 2, label: '禁用' },
            ],
          },
          { name: 'menu_count', label: '已授权菜单数', type: 'number' },
          { name: 'created_at', label: '创建时间', type: 'datetime' },
        ],
        state: () => ({
          count: options.roles.length,
          loading: options.loading,
          note: '关键词与页码是页面状态，不进这里；这里给的是当前页的角色清单',
        }),
        read: () =>
          options.roles.map((role) => ({
            id: role.id,
            name: role.name,
            code: role.code,
            description: role.description,
            status: role.status,
            menu_count: role.menu_count,
            created_at: role.created_at,
          })),
      },
    ],
    reload: options.reload,
  })
}
