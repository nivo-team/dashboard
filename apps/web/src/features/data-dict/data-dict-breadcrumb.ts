import { useEffect, useMemo } from 'react'
import { clearBreadcrumbTrail, setBreadcrumbTrail } from '#/lib/breadcrumb-trail'
import type { BreadcrumbTrailNode } from '#/lib/breadcrumb-trail'
import type { DictType } from './data-dict-types'

/**
 * 把分类层级注册进顶栏面包屑（机制见 `#/lib/breadcrumb-trail`）。
 *
 * 注册后 `/$appId/system/data-dict/39` 在顶栏会显示为
 * `首页 / 系统 / 数据字典 / 公共定义 / 渠道包`，其中祖先分类可点回各自的详情页 ——
 * 这是下钻式布局下**逐级返回**的主要入口（页面内不再放返回按钮）。
 *
 * owner 说明：注册表按 owner 覆盖式写入，同一 owner 被多处调用会互相覆盖。
 * 分类列表页与详情页可能同帧挂载（跳转过渡），若共用一个 owner 会把对方的注册项清掉，
 * 因此这里按「注册来源」分两个 owner。
 */

/** 分类详情视图的注册 owner（由详情页使用）。 */
const DETAIL_OWNER = 'system:data-dict:detail'
/** 分类列表视图的注册 owner（由列表页使用）。 */
const LIST_OWNER = 'system:data-dict:list'

/** 分类列表路径。 */
export function dataDictListPath(appId: string): string {
  return `/${appId}/system/data-dict`
}

/** 某个分类的详情路径。 */
export function dataDictTypePath(appId: string, typeId: number | string): string {
  return `/${appId}/system/data-dict/${typeId}`
}

/**
 * 把分类树拍平成「路径 → { 名称, 父级路径 }」的注册表。
 *
 * `nodes` 传的是**根分类的直接子分类**（模块可见的最顶层），因此面包屑是
 * `数据字典 / 一级分类 / 二级分类 …`，逐级可点；
 * 根分类自身（`DICT_ROOT_TYPE_ID`）是模块边界，不进入面包屑。
 */
export function buildDictTypeTrail(
  nodes: DictType[],
  appId: string,
): Record<string, BreadcrumbTrailNode> {
  const table: Record<string, BreadcrumbTrailNode> = {}
  const rootPath = dataDictListPath(appId)

  const walk = (list: DictType[], parentPath: string) => {
    for (const node of list) {
      if (node.id === undefined || node.id === null) continue

      const path = dataDictTypePath(appId, node.id)
      table[path] = {
        label: node.name || node.code || String(node.id),
        parent: parentPath,
      }
      walk(node.children ?? [], path)
    }
  }

  walk(nodes, rootPath)
  return table
}

/**
 * 注册分类层级表。
 *
 * @param nodes 整棵分类树
 * @param appId 当前应用标识
 * @param extra 额外条目（优先级高于树节点）
 */
export function useDictTypeBreadcrumbTrail(
  nodes: DictType[],
  appId: string,
  extra?: Record<string, BreadcrumbTrailNode>,
) {
  const entries = useMemo(() => {
    const table = buildDictTypeTrail(nodes, appId)
    return { ...table, ...extra }
  }, [appId, extra, nodes])

  useEffect(() => {
    // 树还没到达时先不注册，避免用空表覆盖已注册的层级
    if (nodes.length === 0) return
    setBreadcrumbTrail(DETAIL_OWNER, entries)
    return () => clearBreadcrumbTrail(DETAIL_OWNER)
  }, [entries, nodes.length])
}

/**
 * 注册分类列表自身的层级（列表页调用，与详情注册互不覆盖）。
 *
 * `root` 只用于「树未到达时不要用空表覆盖已注册层级」的判定，根分类自身不进面包屑。
 */
export function useDictListBreadcrumbTrail(nodes: DictType[], appId: string, root?: DictType) {
  const entries = useMemo(() => buildDictTypeTrail(nodes, appId), [appId, nodes])
  const ready = Boolean(root) && nodes.length > 0

  useEffect(() => {
    if (!ready) return
    setBreadcrumbTrail(LIST_OWNER, entries)
    return () => clearBreadcrumbTrail(LIST_OWNER)
  }, [entries, ready])
}
