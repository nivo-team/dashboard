import { Checkbox } from '@cloudflare/kumo'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuNode } from '#/api'

/**
 * 菜单授权树（角色详情页用）。
 *
 * 形态是**扁平渲染 + 缩进**（不是嵌套 DOM）：`Checkbox` 是 Kumo 的表单控件，
 * 嵌套结构下焦点顺序会乱、缩进也要在每层重复写一遍。拍平后只维护一份「深度」即可。
 *
 * 联动规则（与后端 `visibleMenuTree` 的裁剪语义对齐）：
 * - 勾选 → 连带全部后代 + **向上补齐祖先**（父节点没被授权时，后端不会返回它的子节点，
 *   所以只勾子项等于白勾）；
 * - 取消 → 连带取消全部后代。
 */
export interface MenuTreeSelectionProps {
  /** 全量菜单树（`GET /system/menu/tree`）。 */
  nodes: MenuNode[]
  /** 已授权的菜单 id。 */
  value: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}

interface FlatMenuNode {
  id: number
  name: string
  depth: number
  type: number
  path: string
  /** 全部后代 id（不含自身）。 */
  descendants: number[]
}

/** 拍平成「行」：每行记住自己的深度与后代集合，联动判定直接用。 */
function flattenMenuTree(
  nodes: MenuNode[],
  depth: number,
  parentOf: Map<number, number>,
  out: FlatMenuNode[],
): FlatMenuNode[] {
  for (const node of nodes) {
    const children = (node.children ?? []) as MenuNode[]
    for (const child of children) parentOf.set(child.menu_id, node.menu_id)
    out.push({
      id: node.menu_id,
      name: node.menu_name,
      depth,
      type: node.menu_type,
      path: node.path ?? '',
      descendants: collectMenuIds(children),
    })
    flattenMenuTree(children, depth + 1, parentOf, out)
  }
  return out
}

function collectMenuIds(nodes: MenuNode[]): number[] {
  return nodes.flatMap((node) => [
    node.menu_id,
    ...collectMenuIds((node.children ?? []) as MenuNode[]),
  ])
}

export function MenuTreeSelection({
  nodes,
  value,
  onChange,
  disabled = false,
}: MenuTreeSelectionProps) {
  const { t } = useTranslation('roles')

  const { flatNodes, parentOf } = useMemo(() => {
    const parentMap = new Map<number, number>()
    return { flatNodes: flattenMenuTree(nodes, 0, parentMap, []), parentOf: parentMap }
  }, [nodes])

  const selected = useMemo(() => new Set(value), [value])

  const toggle = (node: FlatMenuNode, checked: boolean) => {
    const next = new Set(selected)
    if (checked) {
      next.add(node.id)
      for (const descendant of node.descendants) next.add(descendant)
      // 向上补齐祖先，否则后端看不到这个子项（父不可见时整支不返回）
      let cursor = parentOf.get(node.id)
      while (cursor !== undefined) {
        next.add(cursor)
        cursor = parentOf.get(cursor)
      }
    } else {
      next.delete(node.id)
      for (const descendant of node.descendants) next.delete(descendant)
    }
    onChange([...next])
  }

  return (
    <div className="flex flex-col gap-0.5">
      {flatNodes.map((node) => {
        const checked = selected.has(node.id)
        // 自身没选但后代有选 → 半选
        const partial = !checked && node.descendants.some((id) => selected.has(id))
        return (
          <label
            key={node.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-kumo-elevated"
            style={{ paddingInlineStart: `${node.depth * 20 + 8}px` }}
          >
            <Checkbox
              checked={checked}
              indeterminate={partial}
              disabled={disabled}
              onCheckedChange={(next) => toggle(node, Boolean(next))}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-kumo-default">{node.name}</span>
            {node.type === 3 ? (
              <span className="shrink-0 text-xs text-kumo-subtle">
                {t('menuTree.action', '操作')}
              </span>
            ) : node.path ? (
              <span className="shrink-0 font-mono text-xs text-kumo-subtle">{node.path}</span>
            ) : null}
          </label>
        )
      })}
    </div>
  )
}
