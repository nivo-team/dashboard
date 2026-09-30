import type { MenuNode } from '#/api'

/**
 * 功能（Features）域的枚举与树工具（模块私有，不参与路由扫描）。
 *
 * 数据层沿用后端 `model.SysMenu` 与 `/system/menu` 系列接口，字段命名不改：
 * `menu_type` 1 功能组（目录）/ 2 功能（菜单）/ 3 操作；`status` 1 启用 / 2 禁用；
 * `visible` 1 可见 / 2 不可见；`is_frame` 1 是 / 2 否；
 * `no_cache` 1 不缓存 / 2 缓存（注意：与字段名语义相反）。
 *
 * 组件层只引用下面的 `*Key` 映射拿 i18n 文案键，禁止在 JSX 里硬编码数字判断分支。
 */

/**
 * 新架构功能的根节点 id —— **这份数据不供旧系统使用**。
 *
 * ⏳ **临时值（当前必须保留）**
 * - 来源：测试环境实测（2026-09）。482 是后端为「新架构」单独建的根节点 `new-adm`，
 *   新后台自己的功能树都挂在它下面（`system` → `menus` → `menus.add`）。
 * - 用途：本模块所有请求都靠它把范围限定在新架构内 —— 不带 `menu_id` 会拖出旧系统整棵历史菜单树。
 * - 删除条件：后端提供「当前应用的功能根节点」查询、或由 App 配置下发根 id 之后，
 *   改成运行时获取即可删掉这个常量（全局搜索 `MENU_ROOT_ID` 只有本模块一处引用链）。
 *
 * 背景：旧后台把 `GET /system/menu/tree`（**不带参数**）返回的整棵历史菜单树当作导航数据源，
 * 其中混着大量旧系统菜单。新架构后台的功能统一挂在这一个根节点（482）之下，与旧系统完全隔离。
 *
 * 接口语义（已对测试环境实测确认）：
 *
 * 1. `GET /system/menu/tree?menu_id=<id>` 返回的是**该 id 的直接子节点数组**
 *    （后代嵌套在各自的 `children` 里），**不含该 id 自身**；
 * 2. 不带 `menu_id` 会返回旧系统整棵树，因此本模块**永远带 `MENU_ROOT_ID`**；
 * 3. 482 的直接子节点数组里已经嵌好了整棵新架构功能树（实测约 1.2KB），
 *    因此本模块统一只发这一个请求（见 `./use-features-tree.ts`），
 *    视图分流、祖先链与子项表格全部由这棵树在本地派生；
 * 4. 需要「节点自身」信息时用树的遍历结果（`findMenuPath`），不再依赖
 *    `result[0]` 这类位置约定 —— 该约定与接口真实语义相反，会把第一个子节点误当自身。
 *
 * 后端若调整新架构功能的根节点，只改这一个常量即可。
 */
export const MENU_ROOT_ID = 482

/**
 * 写入时给 `component` 的占位值。
 *
 * ⏳ **临时值**：删除条件 = 后端放开 `component` 的非空校验。
 *
 * 新架构的菜单不参与旧系统的组件路由（真实数据里已有节点的 `component` 也是 `/ignore`），
 * 但后端 `v1.SysMenuCreateReq` / `v1.SysMenuUpdateReq` 目前仍会把「组件[Component]不能为空」
 * 当成校验错误。这里统一填占位值先跑通流程，等后端放开校验后删掉即可。
 */
export const MENU_PLACEHOLDER_COMPONENT = '/ignore'

/**
 * 写入时给 `path` 的占位值。
 *
 * ⏳ **临时值**：删除条件 = 后端放开 `path` 的非空校验。
 *
 * 与 `MENU_PLACEHOLDER_COMPONENT` 同理：新架构不使用旧系统的路由路径（真实数据里已有节点的
 * `path` 也是 `/ignore`），但后端仍校验「路由地址[Path]不能为空」。等后端放开后一并删除。
 */
export const MENU_PLACEHOLDER_PATH = '/ignore'

export const MENU_TYPE = {
  /** 功能组（目录）：只有容器视图，可继续嵌套 */
  directory: 1,
  /** 功能（菜单）：有详情视图 */
  menu: 2,
  /** 操作：功能下的权限点，本轮无落点视图 */
  action: 3,
} as const

export const MENU_STATUS = {
  enabled: 1,
  disabled: 2,
} as const

export const MENU_VISIBLE = {
  visible: 1,
  hidden: 2,
} as const

export const MENU_IS_FRAME = {
  yes: 1,
  no: 2,
} as const

export const MENU_NO_CACHE = {
  noCache: 1,
  cache: 2,
} as const

/** 功能类型 → i18n 键后缀；未知取值返回 `undefined`，由调用方兜底展示原始值。 */
export function menuTypeKey(value: unknown): 'directory' | 'menu' | 'action' | undefined {
  switch (value) {
    case MENU_TYPE.directory:
      return 'directory'
    case MENU_TYPE.menu:
      return 'menu'
    case MENU_TYPE.action:
      return 'action'
    default:
      return undefined
  }
}

/** 状态 → i18n 键后缀。 */
export function menuStatusKey(value: unknown): 'enabled' | 'disabled' | undefined {
  switch (value) {
    case MENU_STATUS.enabled:
      return 'enabled'
    case MENU_STATUS.disabled:
      return 'disabled'
    default:
      return undefined
  }
}

/** 是否可见 → i18n 键后缀。 */
export function menuVisibleKey(value: unknown): 'visible' | 'hidden' | undefined {
  switch (value) {
    case MENU_VISIBLE.visible:
      return 'visible'
    case MENU_VISIBLE.hidden:
      return 'hidden'
    default:
      return undefined
  }
}

/** 是否外链 → i18n 键后缀。 */
export function menuIsFrameKey(value: unknown): 'yes' | 'no' | undefined {
  switch (value) {
    case MENU_IS_FRAME.yes:
      return 'yes'
    case MENU_IS_FRAME.no:
      return 'no'
    default:
      return undefined
  }
}

/** 路由缓存 → i18n 键后缀。 */
export function menuNoCacheKey(value: unknown): 'noCache' | 'cache' | undefined {
  switch (value) {
    case MENU_NO_CACHE.noCache:
      return 'noCache'
    case MENU_NO_CACHE.cache:
      return 'cache'
    default:
      return undefined
  }
}

/** 是否为功能组（目录）：只有容器视图，没有详情页。 */
export function menuIsGroup(node?: MenuNode | null): boolean {
  return node?.menu_type === MENU_TYPE.directory
}

/** 把后端返回的状态值收敛为表单可用的 `1 | 2`（未知一律按启用处理）。 */
export function toMenuStatus(
  value: unknown,
): typeof MENU_STATUS.enabled | typeof MENU_STATUS.disabled {
  return value === MENU_STATUS.disabled ? MENU_STATUS.disabled : MENU_STATUS.enabled
}

/** 把后端返回的可见性值收敛为表单可用的 `1 | 2`（未知一律按显示处理）。 */
export function toMenuVisible(
  value: unknown,
): typeof MENU_VISIBLE.visible | typeof MENU_VISIBLE.hidden {
  return value === MENU_VISIBLE.hidden ? MENU_VISIBLE.hidden : MENU_VISIBLE.visible
}

/** 是否为操作（权限点）：本轮没有可进入的视图。 */
export function menuIsAction(node?: MenuNode | null): boolean {
  return node?.menu_type === MENU_TYPE.action
}

/** 该节点是否有可进入的视图（功能组 → 容器视图，功能 → 详情视图，操作 → 无）。 */
export function menuIsNavigable(node?: MenuNode | null): boolean {
  return Boolean(node?.menu_id) && !menuIsAction(node)
}

/** 命中判断使用的可搜索字段（不含新架构已废弃的 `path` / `component`）。 */
const SEARCHABLE_FIELDS: (keyof MenuNode)[] = [
  'menu_name',
  'permission',
  'route_name',
  'icon',
]

/** 判断单个节点是否命中关键词（只匹配当前层级展示的数据）。 */
export function matchesMenuKeyword(menu: MenuNode, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return SEARCHABLE_FIELDS.some((field) => {
    const value = menu[field]
    return typeof value === 'string' && value.toLowerCase().includes(kw)
  })
}

/** 在功能树中按 id 查找节点（演示兜底数据取根节点时使用）。 */
export function findMenuById(
  nodes: MenuNode[] | undefined,
  menuId: number,
): MenuNode | undefined {
  for (const node of nodes ?? []) {
    if (node.menu_id === menuId) return node
    const hit = findMenuById(node.children, menuId)
    if (hit) return hit
  }
  return undefined
}

/** 功能树中某个节点的定位结果。 */
export interface MenuPath {
  /** 命中的节点；未命中时为 `undefined`。 */
  node?: MenuNode
  /**
   * 从根到父的祖先链（不含自身）；未命中时为空数组。
   *
   * 说明：页面内的名称面包屑已按设计移除（顶栏已有全局面包屑），当前调用方只消费 `node`；
   * 这里仍然返回祖先链，供后续需要「按名称展示层级 / 跳回任意祖先层」时直接复用，
   * 避免再遍历一次功能树。
   */
  ancestors: MenuNode[]
}

/**
 * 在功能树中定位节点，并同时返回它的祖先链。
 *
 * 一次遍历同时满足两个诉求：判定该节点该渲染容器视图还是详情视图（自身 `menu_type`），
 * 以及给页面内面包屑提供祖先名称（祖先链）。
 */
export function findMenuPath(
  nodes: MenuNode[] | undefined,
  menuId: number,
  ancestors: MenuNode[] = [],
): MenuPath {
  for (const node of nodes ?? []) {
    if (node.menu_id === menuId) return { node, ancestors }
    const hit = findMenuPath(node.children, menuId, [...ancestors, node])
    if (hit.node) return hit
  }
  return { ancestors: [] }
}

/** 取节点的直接子项（缺失时为 `[]`）。 */
export function menuChildren(node?: MenuNode | null): MenuNode[] {
  return node?.children ?? []
}

/**
 * 树表访问器（模块级常量）：过滤、展开与 `useTable` 共用同一份，引用稳定。
 */
export const MENU_SUB_ROWS = (menu: MenuNode): MenuNode[] | undefined =>
  menu.children

export const MENU_ROW_ID = (menu: MenuNode): string => String(menu.menu_id ?? '')


/**
 * 统一把后端时间字段解析为毫秒时间戳。
 *
 * `model.SysMenu.created_at` / `updated_at` 在 OpenAPI 中是字符串（实测形如
 * `2026-09-24 10:31:03`，Go 侧也可能给 RFC3339），因此不能直接交给内置 `time` 渲染器
 * （它只处理秒/毫秒数字），需要在此兜底解析：数字按秒/毫秒自适应，
 * 字符串同时兼容 ISO 与 `YYYY-MM-DD HH:mm:ss`。
 */
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
