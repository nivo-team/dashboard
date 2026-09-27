import { displayDictCode } from '#/lib/dict-key'
import { filterTreeByMatch } from '#/lib/tree-search'
import type { DictType } from './data-dict-types'

/**
 * 数据字典域的枚举与树工具（模块私有，不参与路由扫描）。
 *
 * 组件层只引用下面的 `*Key` 映射拿 i18n 文案键，禁止在 JSX 里硬编码数字判断分支。
 */

/**
 * 后端大量「1 / 2 表示两个取值」的字段类型（`status` / `is_default` 等）。
 *
 * 写成字面量联合而不是 `number`，是为了让表单值能直接喂给生成的请求体类型
 * （`v1.DataDictCreateReq.status` 等字段的类型就是 `1 | 2`），省掉一层断言。
 */
export type DictBinaryFlag = 1 | 2

export const DICT_STATUS = {
  enabled: 1,
  disabled: 2,
} as const

/**
 * 分类的「键值类型」。
 *
 * 实测依据（2026-09）：旧后台 `旧后台 src/views/data_dict/data.ts` 的 `typeFormSchema` 里，
 * `type` 字段 label 为「键值类型」、helpMessage 为「确定键值的数据类型」，
 * 选项是 `{ label: 'string', value: 1 }` / `{ label: 'number', value: 2 }`。
 * openapi 里该字段的描述只有一句无信息量的「数据类型」，因此以此为准。
 */
export const DICT_VALUE_TYPE = {
  string: 1,
  number: 2,
} as const

/** 是否默认。 */
export const DICT_IS_DEFAULT = {
  yes: 1,
  no: 2,
} as const

/**
 * 数据字典的根分类 id —— **本模块的业务范围起点**。
 *
 * ⏳ **临时值（当前必须保留）**
 * - 来源：架构升级期间由后端指定的新根分类（与 features 的 `MENU_ROOT_ID = 482` 是同一类约定）。
 * - 用途：`GET /data_dict/type/tree` 是**无参数全量**接口，一次返回所有分类（实测 13 个顶层、
 *   60 个节点，里面既有新架构数据也有历史数据）。本模块用它在本地把范围收窄到该根之下：
 *   分类列表只渲染这个节点的**直接子分类**，下钻与父级选择都不会越出它的子树。
 * - 删除条件：后端提供「当前应用的字典根分类」查询、或由 App 配置下发根 id 之后，
 *   改成运行时获取即可删掉这个常量（全局搜索 `DICT_ROOT_TYPE_ID` 只有本模块一处引用链）。
 */
export const DICT_ROOT_TYPE_ID = 67

/** 默认每页条数（与用户列表 / 功能列表保持一致）。 */
export const DEFAULT_PAGE_SIZE = 15

/** 秒级/毫秒级时间戳容错解析（与 features 的 `toEpochMs` 同一实现，避免跨模块深层依赖）。 */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? (value < 1e11 ? value * 1000 : value) : null
  }

  const text = String(value).trim()
  if (!text) return null

  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric < 1e11 ? numeric * 1000 : numeric

  const parsed = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isNaN(parsed) ? null : parsed
}

/** 状态 → i18n 键后缀。 */
export function dictStatusKey(value: unknown): 'enabled' | 'disabled' | undefined {
  switch (value) {
    case DICT_STATUS.enabled:
      return 'enabled'
    case DICT_STATUS.disabled:
      return 'disabled'
    default:
      return undefined
  }
}

/** 键值类型 → i18n 键后缀。 */
export function dictValueTypeKey(value: unknown): 'string' | 'number' | undefined {
  switch (value) {
    case DICT_VALUE_TYPE.string:
      return 'string'
    case DICT_VALUE_TYPE.number:
      return 'number'
    default:
      return undefined
  }
}

/** 是否默认 → i18n 键后缀。 */
export function dictIsDefaultKey(value: unknown): 'yes' | 'no' | undefined {
  switch (value) {
    case DICT_IS_DEFAULT.yes:
      return 'yes'
    case DICT_IS_DEFAULT.no:
      return 'no'
    default:
      return undefined
  }
}

/** 把后端返回的状态收敛为表单可用的 `1 | 2`（未知一律按启用处理）。 */
export function toDictStatus(
  value: unknown,
): typeof DICT_STATUS.enabled | typeof DICT_STATUS.disabled {
  return value === DICT_STATUS.disabled ? DICT_STATUS.disabled : DICT_STATUS.enabled
}

/** 把后端返回的键值类型收敛为表单可用的 `1 | 2`（未知一律按 string 处理）。 */
export function toDictValueType(
  value: unknown,
): typeof DICT_VALUE_TYPE.string | typeof DICT_VALUE_TYPE.number {
  return value === DICT_VALUE_TYPE.number ? DICT_VALUE_TYPE.number : DICT_VALUE_TYPE.string
}

/** 把后端返回的「是否默认」收敛为表单可用的 `1 | 2`（未知一律按「否」处理）。 */
export function toDictIsDefault(
  value: unknown,
): typeof DICT_IS_DEFAULT.yes | typeof DICT_IS_DEFAULT.no {
  return value === DICT_IS_DEFAULT.yes ? DICT_IS_DEFAULT.yes : DICT_IS_DEFAULT.no
}

/** 取分类的直接子分类（缺失时为 `[]`）。 */
export function dictTypeChildren(node?: DictType | null): DictType[] {
  return node?.children ?? []
}

/**
 * 在分类树中定位节点。
 *
 * `GET /data_dict/type/tree` 是**无参全量**接口（不像 features 需要 `menu_id` 限子树），
 * 所以这里不需要任何根 id 硬编码，直接遍历整棵树即可。
 */
export function findDictType(
  nodes: DictType[] | undefined,
  typeId: number,
): DictType | undefined {
  for (const node of nodes ?? []) {
    if (node.id === typeId) return node
    const hit = findDictType(node.children, typeId)
    if (hit) return hit
  }
  return undefined
}

/** 分类树中某个节点的定位结果。 */
export interface DictTypePath {
  /** 命中的节点；未命中时为 `undefined`。 */
  node?: DictType
  /** 从根到父的祖先链（不含自身）；未命中时为空数组。 */
  ancestors: DictType[]
}

/** 在分类树中定位节点，并同时返回它的祖先链（供面包屑与「回到上级」复用）。 */
export function findDictTypePath(
  nodes: DictType[] | undefined,
  typeId: number,
  ancestors: DictType[] = [],
): DictTypePath {
  for (const node of nodes ?? []) {
    if (node.id === typeId) return { node, ancestors }
    const hit = findDictTypePath(node.children, typeId, [...ancestors, node])
    if (hit.node) return hit
  }
  return { ancestors: [] }
}

/** 分类的可搜索字段（名称 / 局部码 / 完整码）。 */
const TYPE_SEARCHABLE_FIELDS: (keyof DictType)[] = ['name', 'code', 'p_code']

/**
 * 树表访问器（模块级常量）：过滤、展开与 `useTable` 共用同一份，引用稳定。
 */
export const DICT_TYPE_SUB_ROWS = (row: DictType): DictType[] | undefined =>
  row.children

export const DICT_TYPE_ROW_ID = (row: DictType): string => String(row.id)

/** 判断单个分类是否命中关键词（只匹配当前层级展示的数据）。 */
export function matchesDictTypeKeyword(node: DictType, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return TYPE_SEARCHABLE_FIELDS.some((field) => {
    const value = node[field]
    return typeof value === 'string' && value.toLowerCase().includes(kw)
  })
}

/**
 * 过滤分类树：**只保留命中节点 + 其祖先链**。
 *
 * - 命中节点只带**命中的后代**（没匹配上的下级不出现在结果里）；
 * - 祖先因 `children` 非空被保留 —— 树表在前端搜索时必须保留祖先，
 *   否则深层命中会因为父级被过滤掉而不可见。
 *
 * 匹配字段见 `TYPE_SEARCHABLE_FIELDS`；字典项不参与这里的过滤（它们走服务端的 `kw` 参数）。
 */
export function filterDictTypeTree(nodes: DictType[], keyword: string): DictType[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return nodes

  // 通用规则（只保留命中节点 + 其祖先链、命中节点只带命中的后代）在
  // #/lib/tree-search 的 filterTreeByMatch；这里只提供本模块的字段匹配与行结构
  return filterTreeByMatch(nodes, (node) => matchesDictTypeKeyword(node, kw), {
    getSubRows: DICT_TYPE_SUB_ROWS,
    withChildren: (node, children) => ({ ...node, children }),
  })
}

/** 取分类的展示名（名称缺失时回落到编码，再回落到 id）。 */
export function dictTypeLabel(node?: DictType | null): string {
  if (!node) return ''
  // 回落到编码时同样走命名空间适配，避免面包屑里出现 `new.` 前缀（见 #/lib/dict-key）
  return node.name || displayDictCode(node.p_code) || node.code || String(node.id)
}
