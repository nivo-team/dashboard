import type { FeatureContainerSnapshot } from '../feature-container'
import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 功能**根视图**的特性声明（`/$appId/system/menus`）。
 *
 * 根视图渲染根节点（`MENU_ROOT_ID = 482`）的直接子项 —— 也就是整个后台的功能骨架。
 * 用户问「有哪些功能组 / 某某功能在不在 / 某个功能的权限标识是什么」时，AI 直接读这一层即可，
 * 不必再从 `GET /system/menu/tree?menu_id=482` 拉一遍。
 *
 * **数据来自容器组件的上报**（`FeatureContainerSnapshot`），不在页面里再算一遍：
 * "这一层有哪些行"的推导（收窄到当前容器 + 本地搜索过滤）只在 `FeatureContainer` 里有一份，
 * 页面重算是第二份真值（见 `feature-container.tsx` 的 `onData` 注释）。
 *
 * **没有 `commands`**：新建 / 删除的弹窗状态在 `FeatureContainer` 内部，页面拿不到句柄 ——
 * 与数据字典同一条理由（补齐方式见 features-architecture.md §7）。
 */

export interface FeatureTreeListFeatureOptions {
  /** 容器上报的快照；还没拿到时为 `null` */
  snapshot: FeatureContainerSnapshot | null
}

export function createFeatureTreeListFeature(
  options: FeatureTreeListFeatureOptions,
): FeatureSpec {
  const snapshot = options.snapshot

  return defineFeature({
    title: '功能菜单树（根层级）',
    description:
      '树表浏览根节点的直接子项（功能组与功能），可展开下钻、本地搜索（名称 / 权限标识 / 路由名称 / 图标）、新建与删除；点名称进入容器或详情。',
    entities: ['功能组', '功能', '权限点', '路由名称', '权限标识'],
    endpoints: [
      {
        method: 'GET',
        path: '/system/menu/tree',
        purpose: '按 menu_id 拉某一层的直接子节点（根层是 482；接口不含被请求节点自身）',
      },
      { method: 'POST', path: '/system/menu', purpose: '新建功能组 / 功能 / 权限点' },
      { method: 'PUT', path: '/system/menu', purpose: '更新节点（功能详情页提交）' },
      {
        method: 'DELETE',
        path: '/system/menu/{id}',
        purpose: '删除节点（连同下级；有子项时前端先拦、空叶子要输入名称确认）',
      },
      { method: 'GET', path: '/api', purpose: '绑定接口选择器的候选清单（约 632 条）' },
    ],
    dataSources: [
      {
        id: 'feature-tree',
        title: '当前这一层的功能',
        description:
          '根节点（482）的直接子项；`children` 里是各自的下级。**本地搜索会改变这一份**（只剩命中节点 + 祖先链）',
        shape:
          '每行：menu_id / menu_name / menu_type（1 功能组 2 功能 3 权限点）/ permission（权限标识）/ route_name / path / status / visible / sort / api_keys / children[]',
        state: () => ({
          containerId: snapshot?.containerId ?? null,
          keyword: snapshot?.keyword ?? '',
          count: snapshot?.rows.length ?? 0,
          loading: snapshot?.loading ?? true,
          demoMode: snapshot?.demoMode ?? false,
        }),
        read: () =>
          (snapshot?.rows ?? []).map((row) => ({
            menu_id: row.menu_id,
            menu_name: row.menu_name,
            menu_type: row.menu_type,
            permission: row.permission,
            route_name: row.route_name,
            path: row.path,
            status: row.status,
            visible: row.visible,
            sort: row.sort,
            api_keys: row.api_keys,
            children: (row.children ?? []).map((child) => ({
              menu_id: child.menu_id,
              menu_name: child.menu_name,
              menu_type: child.menu_type,
              permission: child.permission,
            })),
          })),
      },
    ],
    ...(snapshot ? { reload: snapshot.reload } : {}),
  })
}
