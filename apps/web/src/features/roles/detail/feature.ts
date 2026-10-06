import type { RoleItem } from '#/api'
import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 角色**详情**页的特性声明（`/$appId/system/roles/$roleId`）。
 *
 * 与列表页的声明分开：这一页多出的是「菜单授权」这条数据源与写接口。
 */
export interface RoleDetailFeatureOptions {
  role: RoleItem | null
  /** 当前勾选的菜单 id（草稿优先，未改动时是接口返回的授权）。 */
  menuIds: readonly number[]
  loading: boolean
  reload: () => Promise<unknown> | unknown
}

export function createRoleDetailFeature(options: RoleDetailFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '角色详情',
    description:
      '编辑角色的名称 / 角色码 / 描述 / 排序 / 状态，并勾选该角色在导航里可见的菜单；改动经底部浮条统一保存。',
    entities: ['角色', '菜单授权'],
    permissions: ['role:read', 'role:edit'],
    endpoints: [
      { method: 'GET', path: '/role/{id}', permission: 'role:read', purpose: '角色详情' },
      {
        method: 'PUT',
        path: '/role',
        permission: 'role:edit',
        purpose: '更新角色基本信息（内置角色的角色码不可改）',
      },
      {
        method: 'GET',
        path: '/role/menus',
        permission: 'role:read',
        purpose: '查询该角色已授权的菜单 ID',
      },
      {
        method: 'PUT',
        path: '/role/menus',
        permission: 'role:edit',
        purpose: '替换该角色的菜单授权（全量覆盖）',
      },
      {
        method: 'GET',
        path: '/system/menu/tree',
        permission: 'role:read',
        purpose: '取全量菜单树作为勾选面板的数据源',
      },
    ],
    dataSources: [
      {
        id: 'role-detail',
        title: '角色详情与菜单授权',
        description: '当前正在查看的角色，以及它被授权可见的菜单 id',
        shape:
          'role：id / name / code / description / status（1 启用 2 禁用）/ sort / created_at / updated_at；menu_ids：number[]',
        fields: [
          { name: 'id', label: '角色 ID', type: 'number' },
          { name: 'name', label: '角色名称', type: 'string' },
          { name: 'code', label: '角色码', type: 'string' },
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
          { name: 'created_at', label: '创建时间', type: 'datetime' },
          { name: 'updated_at', label: '更新时间', type: 'datetime' },
        ],
        state: () => ({
          menuIds: [...options.menuIds],
          menuCount: options.menuIds.length,
          loading: options.loading,
        }),
        read: () => {
          if (!options.role) return null
          return {
            id: options.role.id,
            name: options.role.name,
            code: options.role.code,
            description: options.role.description,
            status: options.role.status,
            created_at: options.role.created_at,
            updated_at: options.role.updated_at,
          }
        },
      },
    ],
    reload: options.reload,
  })
}
