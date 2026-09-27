/**
 * 顶栏面包屑的「动态层级名称」注册表。
 *
 * 背景：`AppHeader` 的面包屑由 `NAV_GROUPS` 最长前缀匹配 + 剩余路径段拼成，
 * 对 `/$appId/system/features/483` 这类**扁平动态段**只能显示原始段（也就是 `483`）。
 * 而业务模块在数据到达后其实是知道层级的（483 的祖先是 484，名称是 `menus`）。
 *
 * 于是这里提供一个极轻的注册机制，让业务模块把「自身路径 → { 名称, 父级路径 }」
 * 注册进来，`AppHeader` 命中后即可把扁平 URL 还原成可点的层级链：
 *
 * ```text
 * /console/system/features/483  →  首页 / 系统 / 功能 / system / menus
 *                                                      ↑ 可点，回到 484
 * ```
 *
 * 约定：
 * - key 是**含 appId 的完整路径**（如 `/console/system/features/483`），避免跨应用 id 冲突；
 * - `parent` 指向上一级路径，追溯到没有注册项的路径（如 `/console/system/features`）为止；
 * - 按 `owner` 分组注册，owner 卸载时整体清除，模块之间互不干扰。
 *
 * 未注册任何层级时行为完全不变，仍走原来的「原始段」兜底。
 */

/** 单个路径对应的面包屑节点。 */
export interface BreadcrumbTrailNode {
  /** 该层显示的名称。 */
  label: string
  /** 上一级路径；缺省表示这是层级链的起点，不再向上追溯。 */
  parent?: string
}

/** 拍平后的面包屑项（`href` 缺省表示当前页，不可点）。 */
export interface BreadcrumbTrailItem {
  label: string
  href?: string
}

const nodes = new Map<string, BreadcrumbTrailNode>()
const ownerKeys = new Map<string, Set<string>>()
const listeners = new Set<() => void>()

/**
 * 版本号快照：`useSyncExternalStore` 只需要一个稳定可比的值，
 * 直接把内部的 Map 暴露出去反而容易踩到引用相等的坑。
 */
let version = 0

function emit() {
  version += 1
  for (const listener of listeners) listener()
}

export function subscribeBreadcrumbTrail(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBreadcrumbTrailVersion(): number {
  return version
}

/** 覆盖式注册某个 owner 的层级表（重复调用以最后一次为准）。 */
export function setBreadcrumbTrail(
  owner: string,
  entries: Record<string, BreadcrumbTrailNode>,
) {
  clearBreadcrumbTrail(owner, false)

  const keys = new Set<string>()
  for (const [path, node] of Object.entries(entries)) {
    nodes.set(path, node)
    keys.add(path)
  }
  ownerKeys.set(owner, keys)
  emit()
}

/** 清除某个 owner 注册的全部层级（组件卸载时调用）。 */
export function clearBreadcrumbTrail(owner: string, notify = true) {
  const keys = ownerKeys.get(owner)
  if (!keys) return

  for (const key of keys) nodes.delete(key)
  ownerKeys.delete(owner)
  if (notify) emit()
}

/**
 * 把路径还原为可点的层级链（从最上层到当前层）。
 *
 * 路径未注册时返回 `undefined`，由调用方回落到原来的「原始段」逻辑。
 * 链中每一项都带 `href`，只有最后一项（当前页）不带。
 */
export function resolveBreadcrumbTrail(pathname: string): BreadcrumbTrailItem[] | undefined {
  if (!nodes.has(pathname)) return undefined

  const chain: BreadcrumbTrailItem[] = []
  const visited = new Set<string>()
  let cursor: string | undefined = pathname

  while (cursor && !visited.has(cursor)) {
    const node = nodes.get(cursor)
    if (!node) break

    visited.add(cursor)
    chain.unshift({ label: node.label, href: cursor })
    cursor = node.parent
  }

  const last = chain[chain.length - 1]
  if (last) delete last.href

  return chain
}
