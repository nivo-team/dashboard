import type { MenuNode } from '#/api'
import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * **节点视图**的特性声明（`/$appId/system/menus/$featureId`）。
 *
 * 同一个路由按 `menu_type` 分流：功能组(1) → 容器视图（它的子项，可继续嵌套）；
 * 功能(2) / 权限点(3) → 详情视图（基本信息 + 权限点列表）。两种形态的**共同事实**是
 * "这是哪一个节点、它的下级有哪些" —— 页面（`findMenuPath` 定位）手上就有，不需要子组件上报。
 *
 * 表单桥的另一半：功能详情的内嵌表单早在迁移前就接了
 * （`feature-form.tsx` 的 `useAiFormFields` + 详情页的 `useAiFormSubmit`，id = `feature-detail`），
 * 迁移只是把文件搬了位置，桥本身没动。
 *
 * **没有 `commands`**：容器形态的增删入口在 `FeatureContainer` 内部、详情形态的删除在
 * `FeatureDetail` 内部 —— 页面拿不到句柄（与数据字典同一条理由）。
 */

export interface FeatureNodeFeatureOptions {
  /** 当前节点（还没定位到 / id 非法时为 `undefined`） */
  node: MenuNode | undefined
  loading: boolean
  /** 重新取数（保留当前层与搜索状态） */
  reload: () => unknown
}

export function createFeatureNodeFeature(options: FeatureNodeFeatureOptions): FeatureSpec {
  const node = options.node
  const isGroup = (node?.menu_type ?? 0) === 1

  return defineFeature({
    title: node ? `${node.menu_name ?? '功能'}（功能节点）` : '功能节点',
    description: isGroup
      ? '功能组视图：树表浏览它的下级（功能 / 子功能组），可继续下钻、新建与删除。'
      : '功能详情：基本信息（内嵌可编辑表单 + 未保存更改浮条 + 启用开关）、绑定的接口清单与它下面的权限点。',
    entities: ['功能组', '功能', '权限点', '路由名称', '权限标识', '绑定接口'],
    endpoints: [
      {
        method: 'GET',
        path: '/system/menu/tree',
        purpose: '功能树（本页从中定位当前节点，并展示它的下级）',
      },
      {
        method: 'PUT',
        path: '/system/menu',
        purpose: '保存功能基本信息（底部「未保存更改」浮条提交）',
      },
      { method: 'POST', path: '/system/menu', purpose: '新建下级（功能组 / 功能 / 权限点）' },
      { method: 'DELETE', path: '/system/menu/{id}', purpose: '删除当前节点（连同下级）' },
      { method: 'GET', path: '/api', purpose: '绑定接口选择器的候选清单' },
    ],
    dataSources: [
      {
        id: 'feature-node',
        title: '当前功能节点',
        description: '这一页正在看的节点；`children` 是它的下级（功能组的子项 / 功能下的权限点）',
        shape:
          'menu_id / menu_name / menu_type（1 功能组 2 功能 3 权限点）/ parent_id / permission / route_name / path / component / icon / status / visible / is_frame / no_cache / api_keys / sort / children[]',
        state: () => ({
          loading: options.loading,
          isGroup,
          childCount: node?.children?.length ?? 0,
        }),
        read: () =>
          node
            ? {
                menu_id: node.menu_id,
                menu_name: node.menu_name,
                menu_type: node.menu_type,
                parent_id: node.parent_id,
                permission: node.permission,
                route_name: node.route_name,
                path: node.path,
                component: node.component,
                icon: node.icon,
                status: node.status,
                visible: node.visible,
                is_frame: node.is_frame,
                no_cache: node.no_cache,
                api_keys: node.api_keys,
                sort: node.sort,
                children: (node.children ?? []).map((child) => ({
                  menu_id: child.menu_id,
                  menu_name: child.menu_name,
                  menu_type: child.menu_type,
                  permission: child.permission,
                  path: child.path,
                })),
              }
            : null,
      },
    ],
    reload: options.reload,
  })
}
