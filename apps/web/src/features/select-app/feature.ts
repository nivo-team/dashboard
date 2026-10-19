import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 应用选择 / 管理页（`/`，通用外壳）的特性声明。
 *
 * 这一页**既是工作空间的入口**（点行进应用），**又是应用的管理台**（仅超管）：
 * 有 `app:read` 时列出 `GET /app` 的配置视角数据并可增删改，否则只列 `GET /apps`
 * 下发的可用应用、只读。所以数据源只声明两者**共有的行**（口径统一），
 * 具体有哪些字段由页面按当前视图裁剪后传入。
 */
export interface SelectAppRow {
  id: string
  name: string
  category: string
  description: string
  /** 是否可进入（停用应用不可进入）。 */
  enabled: boolean
}

export interface SelectAppFeatureOptions {
  apps: readonly SelectAppRow[]
  loading: boolean
  reload: () => unknown
}

export function createSelectAppFeature(options: SelectAppFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '应用选择与管理',
    description:
      '列出工作空间里的应用：点击进入某个应用的控制台。超级管理员还能新建、编辑、删除应用（含启用 / 停用）；其它角色只看得到自己能进入的应用。应用标识是路由前缀与数据作用域，创建后不可修改。',
    entities: ['应用', '工作空间', '应用标识', '接口根地址'],
    permissions: ['app:read', 'app:create', 'app:edit', 'app:delete'],
    endpoints: [
      {
        method: 'GET',
        path: '/app',
        permission: 'app:read',
        purpose: '应用列表（配置视角，含停用应用与管理字段；仅超级管理员可访问）',
      },
      {
        method: 'GET',
        path: '/apps',
        purpose: '可用应用列表（工作空间视角，只含启用应用；所有登录用户）',
      },
      { method: 'POST', path: '/app', permission: 'app:create', purpose: '新建应用' },
      { method: 'PUT', path: '/app', permission: 'app:edit', purpose: '更新应用' },
      {
        method: 'DELETE',
        path: '/app/{id}',
        permission: 'app:delete',
        purpose: '删除应用',
      },
    ],
    dataSources: [
      {
        id: 'apps',
        title: '应用列表',
        description: '当前视图下的应用（管理员为全部应用，其它角色为可进入的应用）',
        shape: '每行：id / name / category / description / enabled（是否可进入）',
        fields: [
          { name: 'id', label: '应用标识', type: 'string', description: '路由前缀，创建后不可修改' },
          { name: 'name', label: '应用名称', type: 'string' },
          { name: 'category', label: '分类', type: 'string' },
          { name: 'description', label: '说明', type: 'string' },
          {
            name: 'enabled',
            label: '状态',
            type: 'enum',
            options: [
              { value: true, label: '启用' },
              { value: false, label: '禁用' },
            ],
          },
        ],
        state: () => ({
          count: options.apps.length,
          loading: options.loading,
          note: '点某一行进入该应用的控制台（仅启用中的应用可进入）',
        }),
        read: () =>
          options.apps.map((app) => ({
            id: app.id,
            name: app.name,
            category: app.category,
            description: app.description,
            enabled: app.enabled,
          })),
      },
    ],
    reload: options.reload,
  })
}
