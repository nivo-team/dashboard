import { useEffect, useMemo } from 'react'
import type { MenuNode } from '#/api'
import {
  clearBreadcrumbTrail,
  setBreadcrumbTrail,
} from '#/lib/breadcrumb-trail'
import type { BreadcrumbTrailNode } from '#/lib/breadcrumb-trail'

/**
 * 把功能树注册进顶栏面包屑（见 `#/lib/breadcrumb-trail` 的机制说明）。
 *
 * 注册后 `/$appId/system/menus/483` 在顶栏会显示为
 * `首页 / 系统 / 功能 / system / menus`，其中 `system` 可点回到 484 的容器视图 ——
 * 这也是功能详情页「回到所属功能组」的入口（页面内的返回按钮已按设计移除）。
 *
 * 注册表按 owner 覆盖式写入，因此同一个模块内多处调用同一 hook 是安全的。
 */

const OWNER = 'system:features'

/** 功能模块中某个节点的路径（`menuId` 缺省时为功能根视图）。 */
export function featureBreadcrumbPath(appId: string, menuId?: number): string {
  return menuId === undefined
    ? `/${appId}/system/menus`
    : `/${appId}/system/menus/${menuId}`
}

/**
 * 注册功能层级表。
 *
 * @param nodes 功能树（根节点的子节点数组即可，后代会被递归注册）
 * @param appId 当前应用标识
 * @param extra 额外条目（如创建页自身的路径），优先级高于树节点
 */
export function useFeatureBreadcrumbTrail(
  nodes: MenuNode[],
  appId: string,
  extra?: Record<string, BreadcrumbTrailNode>,
) {
  const entries = useMemo(() => {
    const table: Record<string, BreadcrumbTrailNode> = {}
    const rootPath = featureBreadcrumbPath(appId)

    const walk = (list: MenuNode[], parentPath: string) => {
      for (const node of list) {
        if (node.menu_id === undefined || node.menu_id === null) continue

        const path = featureBreadcrumbPath(appId, node.menu_id)
        table[path] = {
          label: node.menu_name || String(node.menu_id),
          parent: parentPath,
        }
        walk(node.children ?? [], path)
      }
    }

    walk(nodes, rootPath)
    return { ...table, ...extra }
  }, [appId, extra, nodes])

  useEffect(() => {
    setBreadcrumbTrail(OWNER, entries)
    return () => clearBreadcrumbTrail(OWNER)
  }, [entries])
}
