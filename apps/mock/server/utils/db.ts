/**
 * 内存数据层。
 *
 * 全部数据放在模块级变量里：**写操作真正生效**（新增后列表立刻能看到），
 * 但仅存活于进程内 —— 重启即回到初始状态。这正是 Mock 需要的语义：
 * 不用维护数据库，又足够把一个后台的增删改查流程完整走通。
 *
 * 字段命名与前端的既有消费保持一致（例如功能菜单沿用 `menu_type` 这类
 * 数字枚举），避免为了「好看」而让已经在用的页面返工。
 */

/* -------------------------------------------------------------------------- */
/*                                  类型                                       */
/* -------------------------------------------------------------------------- */

export interface MenuRow {
  menu_id: number
  parent_id: number
  menu_name: string
  /** 1 目录 / 2 菜单 / 3 操作（权限点） */
  menu_type: number
  /**
   * **路由地址（相对 appId）**：`menu_type` 1 / 2 使用，指定打开该菜单落到哪个前端路由。
   *
   * - 1 目录：该目录的落地路由（如 `/system`）；
   * - 2 菜单：具体页面（如 `/system/menus`）；
   * - 3 操作：没有路由，留空。
   *
   * 旧数据把它一律写成 `/ignore`（占位垃圾值），前端拿它渲染导航会直接 404。
   */
  path: string
  /** 前端组件路径（保留字段，当前架构不使用）。 */
  component: string
  /** 路由名称（保留字段，新架构用 `path` 表达落点）。 */
  route_name: string
  /** 权限标识：仅 `menu_type` 3 使用，必须与 `permissions.get.ts` 的权限点逐字一致。 */
  permission: string
  icon: string
  sort: number
  /** 1 启用 / 2 禁用 */
  status: number
  /** 1 可见 / 2 隐藏 */
  visible: number
  /** 1 是外链 / 2 否 */
  is_frame: number
  /** 1 不缓存 / 2 缓存（与字段名语义相反，沿用后端定义） */
  no_cache: number
  api_keys: string[]
  created_at: string
  updated_at: string
}

export interface RoleRow {
  id: number
  /** 角色名（展示用）。 */
  name: string
  /**
   * 角色码：与 `mock-accounts.ts` 的 `MockRole` 一一对应（super / editor / viewer）。
   *
   * 导航接口按「登录 token → 账号 → 账号的 role 码 → 角色的菜单关联」这条链过滤菜单，
   * 三个测试账号因此天然对应三个角色。
   */
  code: string
  description: string
  /** 1 启用 / 2 禁用 */
  status: number
  sort: number
  created_at: string
  updated_at: string
}

/**
 * 角色 ↔ 菜单关联（多对多，独立的关联表）。
 *
 * **菜单可见性（这里）与操作权限（`permissions.get.ts` 的权限点）是两个层次**：
 * - 关联表决定「导航里有没有这一项」；
 * - 权限点决定「进去之后按钮能不能点」。
 * 真实后端的 RBAC 通常也是这样两层（菜单授权 + 操作授权）。
 */
export interface RoleMenuRow {
  role_id: number
  menu_id: number
}

export interface DictTypeRow {
  id: number
  parent_id: number
  name: string
  /** 局部码，如 `channel` */
  code: string
  /** 从根到自身的完整 code 链，如 `business.channel` */
  p_code: string
  /** 祖先 id 链（不含自身），如 `/0/4/` */
  id_path: string
  /** 1 启用 / 2 禁用 */
  status: number
  /** 键值类型：1 字符串 / 2 数字 */
  type: number
  sort: number
  remark: string
  created_at: number
  updated_at: number
}

export interface DictItemRow {
  id: number
  type_id: number
  /** 所属分类的完整 code，由分类派生 */
  code: string
  label: string
  value: string
  /** 1 启用 / 2 禁用 */
  status: number
  /** 1 是默认 / 2 否 */
  is_default: number
  sort: number
  remark: string
  update_by_user: { uid: number; username: string; nick_name: string }
  created_at: number
  updated_at: number
}

export interface UserRow {
  id: number
  nickname: string
  avatar_url: string
  email: string
  /** 注册时间（秒级时间戳） */
  createtime: number
  /** 最近登录时间（秒级时间戳） */
  logintime: number
}

/**
 * 工单 —— 「**没有批量接口**」的演示实体。
 *
 * 它刻意只提供单条接口（`GET/POST/PUT /ticket`、`DELETE /ticket/{id}`、`PATCH /ticket/{id}/status`），
 * **不提供** `/ticket/batch-delete` 这类批量端点：用来验证 AI 的**自主编排**能力 ——
 * 后端只能一条一条改时，它应当用 `manage_tasks` 一次编排整组步骤、顺序执行，
 * 而不是循环调用单条接口（那样每一条都要一次模型往返）。
 */
export interface TicketRow {
  id: number
  title: string
  /** 工单描述 */
  description: string
  /** 1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭 */
  status: number
  /** 1 低 / 2 中 / 3 高 / 4 紧急 */
  priority: number
  /** 负责人（用户名） */
  assignee: string
  /** 分类，如「缺陷」「需求」 */
  category: string
  created_at: number
  updated_at: number
}

export interface AppRow {
  id: string
  name: string
  headline: string
  description: string
  /** 展示用的域名（不带协议） */
  domain: string
  /** 该应用的接口根地址 */
  apiBaseUrl: string
  badge: string
  category: string
  themeGradient: string
}

/* -------------------------------------------------------------------------- */
/*                                初始数据                                     */
/* -------------------------------------------------------------------------- */

/** 固定基准时间（秒），保证每次启动数据一致、便于对照。 */
const BASE_TS = 1773000000
const day = (n: number) => BASE_TS + n * 86400
const stamp = (n: number) => {
  const d = new Date(day(n) * 1000)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/**
 * 菜单树种子：**三层结构**（目录 → 菜单 → 操作），与前端真实路由对齐。
 *
 * - `menu_type` 1 目录 / 2 菜单 / 3 操作（权限点）；
 * - **1 与 2 都带 `path`**（相对 appId 的路由地址）：目录是它的落地路由（`/system`），
 *   菜单是具体页面（`/system/menus`）；
 * - 3（操作）没有路由，只承载权限点，`permission` 必须与 `permissions.get.ts`
 *   的权限清单**逐字一致**（`:read`，不是旧数据的 `:view`）。
 *
 * 之前这份数据有两处失真：`path` 一律写成 `/ignore`、`permission` 用了
 * `:view` 这套与权限清单不同的后缀 —— 谁拿它渲染导航都会 404 / 判定不到权限。
 */
function seedMenus(): MenuRow[] {
  const rows: Array<
    Partial<MenuRow> & {
      menu_id: number
      parent_id: number
      menu_name: string
      menu_type: number
      path: string
    }
  > = [
    // 顶层菜单：对应前端「Overview」那个无标题分组
    { menu_id: 1, parent_id: 0, menu_name: '仪表盘', menu_type: 2, path: '/home', icon: 'HouseIcon', sort: 1 },

    // 示例（表格示例 / 复杂表格）—— 权限 key 与模块名统一为 `table-example`
    { menu_id: 10, parent_id: 0, menu_name: '示例', menu_type: 1, path: '/example', icon: 'SquaresFourIcon', sort: 2 },
    { menu_id: 11, parent_id: 10, menu_name: '表格示例', menu_type: 2, path: '/example/table', sort: 1 },
    { menu_id: 12, parent_id: 11, menu_name: '查看表格示例', menu_type: 3, path: '', permission: 'table-example:read', sort: 1 },
    { menu_id: 13, parent_id: 11, menu_name: '新建记录', menu_type: 3, path: '', permission: 'table-example:create', sort: 2 },
    { menu_id: 14, parent_id: 11, menu_name: '编辑记录', menu_type: 3, path: '', permission: 'table-example:edit', sort: 3 },
    { menu_id: 15, parent_id: 11, menu_name: '删除记录', menu_type: 3, path: '', permission: 'table-example:delete', sort: 4 },
    { menu_id: 16, parent_id: 10, menu_name: '复杂表格', menu_type: 2, path: '/example/complex-table', sort: 2 },
    // 工单管理：**没有批量接口**的 CRUD 示例，用来演示 AI 自主编排
    { menu_id: 17, parent_id: 10, menu_name: '工单管理', menu_type: 2, path: '/example/tickets', sort: 3 },
    { menu_id: 18, parent_id: 17, menu_name: '查看工单', menu_type: 3, path: '', permission: 'ticket:read', sort: 1 },
    { menu_id: 19, parent_id: 17, menu_name: '新建工单', menu_type: 3, path: '', permission: 'ticket:create', sort: 2 },
    { menu_id: 101, parent_id: 17, menu_name: '编辑工单', menu_type: 3, path: '', permission: 'ticket:edit', sort: 3 },
    { menu_id: 102, parent_id: 17, menu_name: '删除工单', menu_type: 3, path: '', permission: 'ticket:delete', sort: 4 },

    // 系统管理
    { menu_id: 20, parent_id: 0, menu_name: '系统管理', menu_type: 1, path: '/system', icon: 'GearSixIcon', sort: 3 },
    { menu_id: 21, parent_id: 20, menu_name: '菜单管理', menu_type: 2, path: '/system/menus', sort: 1 },
    { menu_id: 22, parent_id: 21, menu_name: '查看菜单', menu_type: 3, path: '', permission: 'feature:read', sort: 1 },
    { menu_id: 23, parent_id: 21, menu_name: '新建菜单', menu_type: 3, path: '', permission: 'feature:create', sort: 2 },
    { menu_id: 24, parent_id: 21, menu_name: '编辑菜单', menu_type: 3, path: '', permission: 'feature:edit', sort: 3 },
    { menu_id: 25, parent_id: 21, menu_name: '删除菜单', menu_type: 3, path: '', permission: 'feature:delete', sort: 4 },
    { menu_id: 30, parent_id: 20, menu_name: '数据字典', menu_type: 2, path: '/system/data-dict', sort: 2 },
    { menu_id: 31, parent_id: 30, menu_name: '查看字典', menu_type: 3, path: '', permission: 'dict:read', sort: 1 },
    { menu_id: 32, parent_id: 30, menu_name: '新建字典', menu_type: 3, path: '', permission: 'dict:create', sort: 2 },
    { menu_id: 33, parent_id: 30, menu_name: '编辑字典', menu_type: 3, path: '', permission: 'dict:edit', sort: 3 },
    { menu_id: 34, parent_id: 30, menu_name: '删除字典', menu_type: 3, path: '', permission: 'dict:delete', sort: 4 },
    { menu_id: 40, parent_id: 20, menu_name: '角色管理', menu_type: 2, path: '/system/roles', sort: 3 },
    { menu_id: 41, parent_id: 40, menu_name: '查看角色', menu_type: 3, path: '', permission: 'role:read', sort: 1 },
    { menu_id: 42, parent_id: 40, menu_name: '新建角色', menu_type: 3, path: '', permission: 'role:create', sort: 2 },
    { menu_id: 43, parent_id: 40, menu_name: '编辑角色', menu_type: 3, path: '', permission: 'role:edit', sort: 3 },
    { menu_id: 44, parent_id: 40, menu_name: '删除角色', menu_type: 3, path: '', permission: 'role:delete', sort: 4 },
  ]

  return rows.map((row, index) => ({
    path: '',
    component: '',
    route_name: '',
    permission: '',
    icon: '',
    sort: 0,
    status: 1,
    visible: 1,
    is_frame: 2,
    no_cache: 1,
    api_keys: [],
    created_at: stamp(index),
    updated_at: stamp(index),
    ...row,
  })) as MenuRow[]
}

/** 角色种子：`code` 与 `mock-accounts.ts` 的 `MockRole` 一一对应。 */
function seedRoles(): RoleRow[] {
  const rows: Array<Omit<RoleRow, 'created_at' | 'updated_at'>> = [
    {
      id: 1,
      name: 'Super Admin',
      code: 'super',
      description: '超级管理员：全部菜单与全部操作',
      status: 1,
      sort: 1,
    },
    {
      id: 2,
      name: 'Admin',
      code: 'editor',
      description: '业务管理员：可新建与编辑，不可删除',
      status: 1,
      sort: 2,
    },
    {
      id: 3,
      name: 'Viewer',
      code: 'viewer',
      description: '访客：仅可查看',
      status: 1,
      sort: 3,
    },
  ]

  return rows.map((row) => ({ ...row, created_at: stamp(0), updated_at: stamp(0) }))
}

/**
 * 角色 ↔ 菜单初始关联。
 *
 * Viewer 刻意**看不到「角色管理」**（40 及其操作 41–44）：用来演示
 * 「菜单可见性」与「操作权限」这两层的差异 —— 它在权限清单里仍有 `role:read`，
 * 但导航不会给这个入口。
 */
function seedRoleMenus(): RoleMenuRow[] {
  const allMenuIds = seedMenus().map((m) => m.menu_id)
  const viewerHidden = new Set([40, 41, 42, 43, 44])

  const grantAll = (role_id: number, ids: number[]): RoleMenuRow[] =>
    ids.map((menu_id) => ({ role_id, menu_id }))

  return [
    ...grantAll(1, allMenuIds),
    ...grantAll(2, allMenuIds),
    ...grantAll(3, allMenuIds.filter((id) => !viewerHidden.has(id))),
  ]
}

/**
 * 数据字典分类：两层。
 *
 * `code` 采用**两段式逻辑码**（`user.status`），不带旧后端那层临时的
 * `new.` 命名空间 —— 前端 `src/lib/dict-key.ts` 里标注的「正式版」形态。
 */
function seedDictTypes(): DictTypeRow[] {
  const rows: Array<Omit<DictTypeRow, 'p_code' | 'id_path' | 'created_at' | 'updated_at'>> = [
    { id: 1, parent_id: 0, name: '用户', code: 'user', status: 1, type: 1, sort: 1, remark: '用户域的枚举' },
    { id: 3, parent_id: 1, name: '用户状态', code: 'status', status: 1, type: 2, sort: 2, remark: '账号的启用状态' },
    { id: 4, parent_id: 0, name: '业务', code: 'business', status: 1, type: 1, sort: 2, remark: '业务侧枚举' },
    { id: 5, parent_id: 4, name: '渠道来源', code: 'channel', status: 1, type: 1, sort: 1, remark: '用户注册来源' },
    { id: 6, parent_id: 4, name: '支付方式', code: 'pay-method', status: 2, type: 1, sort: 2, remark: '已下线的旧支付方式' },
  ]

  const byId = new Map(rows.map((r) => [r.id, r]))
  return rows.map((row, index) => {
    const parent = byId.get(row.parent_id)
    const parentChain = parent?.parent_id ? byId.get(parent.parent_id) : undefined
    const ids = [parentChain?.id, parent?.id].filter((v): v is number => typeof v === 'number')
    return {
      ...row,
      p_code: [parentChain?.code, parent?.code, row.code].filter(Boolean).join('.'),
      id_path: `/0/${ids.map((id) => `${id}/`).join('')}`,
      created_at: day(index),
      updated_at: day(index),
    }
  })
}

/** 字典项：挂在叶子分类下。 */
function seedDictItems(): DictItemRow[] {
  const seed: Array<[number, string, string, string, number]> = [
    // [type_id, label, value, remark, is_default]
    [3, '正常', '1', '可正常登录', 1],
    [3, '封禁', '2', '禁止登录', 2],
    [3, '注销', '3', '用户主动注销', 2],

    [5, '自然新增', 'organic', '应用商店 / 搜索', 1],
    [5, '广告投放', 'ads', '买量渠道', 2],
    [5, '邀请裂变', 'invite', '老带新', 2],
    [5, '线下活动', 'offline', '地推与活动', 2],

    [6, '信用卡', 'card', '已停用', 2],
    [6, '电子钱包', 'wallet', '已停用', 2],
  ]

  const typeById = new Map(seedDictTypes().map((t) => [t.id, t]))
  return seed.map(([type_id, label, value, remark, is_default], index) => ({
    id: 1000 + index,
    type_id,
    code: typeById.get(type_id)?.p_code ?? '',
    label,
    value,
    status: 1,
    is_default,
    sort: index + 1,
    remark,
    update_by_user: { uid: 1, username: 'admin', nick_name: '超级管理员' },
    created_at: day(index),
    updated_at: day(index),
  }))
}

const NICK_PREFIX = ['星空', '夜航', '晚风', '星河', '暖阳', '晴空', '月半', '海屿', '晨光', '微澜']
const NICK_SUFFIX = ['漫步者', '旅人', '小助手', '收集者', '守夜人', '观测员', '爱好者', '船长']

/** 用户列表：26 条，够翻几页。 */
function seedUsers(): UserRow[] {
  return Array.from({ length: 26 }, (_, i) => ({
    id: 10001 + i,
    nickname: `${NICK_PREFIX[i % NICK_PREFIX.length]}${NICK_SUFFIX[i % NICK_SUFFIX.length]}`,
    avatar_url: '',
    email: `user${10001 + i}@example.com`,
    createtime: day(-(i + 1)),
    logintime: BASE_TS - i * 3600,
  }))
}

/**
 * 工单种子：40 条，够翻几页、也够演示"批量处理一屏"的场景。
 *
 * 状态刻意分布不均（多数是 1 待处理）—— 「把所有待处理的都关掉」这类请求
 * 才有足够的批量规模去检验编排。
 */
function seedTickets(): TicketRow[] {
  const CATEGORIES = ['缺陷', '需求', '咨询', '运维']
  const TITLES = [
    '登录页在 Safari 下样式错位',
    '导出 CSV 时中文出现乱码',
    '新增字典项后列表未刷新',
    '角色授权树勾选状态丢失',
    '仪表盘卡片加载缓慢',
    '菜单拖拽排序偶发失效',
    '批量删除后分页未回到第一页',
    '用户头像上传失败',
    '筛选条件与 URL 不同步',
    '移动端表格横向滚动卡顿',
  ]
  const ASSIGNEES = ['林工', '陈工', '王工', '赵工', '未分配']

  return Array.from({ length: 40 }, (_, i) => {
    // 状态分布：约一半待处理、四分之一处理中、其余完成 / 关闭
    const status = i % 8 < 4 ? 1 : i % 8 < 6 ? 2 : i % 8 === 6 ? 3 : 4
    const created = day(-(i + 2))
    return {
      id: 70001 + i,
      title: `${TITLES[i % TITLES.length]}${i >= TITLES.length ? `（第 ${Math.floor(i / TITLES.length) + 1} 例）` : ''}`,
      description: `由 ${ASSIGNEES[i % ASSIGNEES.length]} 反馈：${TITLES[i % TITLES.length]}。需要进一步定位原因并给出修复方案。`,
      status,
      priority: ((i % 4) + 1) as number,
      assignee: ASSIGNEES[i % ASSIGNEES.length],
      category: CATEGORIES[i % CATEGORIES.length],
      created_at: created,
      updated_at: created + 3600,
    }
  })
}

/**
 * 可选应用列表。
 *
 * **每个应用都指向本 Mock 服务自己** —— 这就是「完全走 mock」的含义：
 * 切换应用不会切到任何外部后端。`icon` 之类的前端呈现资源不在这里返回，
 * 由前端按 `id` 映射（见 `apps` 接口的注释）。
 */
function seedApps(): AppRow[] {
  // 接口挂在根路径（/login、/user…），所以应用的服务地址就是服务本身，不要再加 /api 后缀
  const base = process.env.MOCK_PUBLIC_URL || 'http://localhost:3001'
  return [
    {
      id: 'app1',
      name: 'App1',
      headline: 'Demo App 1',
      description: '演示应用 1 —— 用于展示多应用切换与数据隔离。',
      domain: 'localhost:3001',
      apiBaseUrl: base,
      badge: 'Demo',
      category: 'Demo',
      themeGradient: 'from-[#0b3323] via-[#0d3f2c] to-[#08261b]',
    },
    {
      id: 'app2',
      name: 'App2',
      headline: 'Demo App 2',
      description: '演示应用 2 —— 与 App1 共用同一份数据。',
      domain: 'localhost:3001',
      apiBaseUrl: base,
      badge: 'Demo',
      category: 'Demo',
      themeGradient: 'from-[#10243f] via-[#163155] to-[#0b1a2e]',
    },
  ]
}

/* -------------------------------------------------------------------------- */
/*                                  存储                                       */
/* -------------------------------------------------------------------------- */

export const db = {
  menus: seedMenus(),
  roles: seedRoles(),
  /** 角色 ↔ 菜单关联：独立的关联表（真实后端 RBAC 的常见形态）。 */
  roleMenus: seedRoleMenus(),
  dictTypes: seedDictTypes(),
  dictItems: seedDictItems(),
  users: seedUsers(),
  tickets: seedTickets(),
  apps: seedApps(),
}

/** 内存自增 id（分开计数，避免不同实体互相干扰）。 */
export const seq = {
  menu: 100,
  role: 100,
  dictType: 100,
  dictItem: 2000,
  user: 20000,
  ticket: 80000,
}

export function nextId(kind: keyof typeof seq): number {
  seq[kind] += 1
  return seq[kind]
}

/** 当前时间，格式与菜单时间字段一致。 */
export function nowStamp(): string {
  return stamp(Math.floor((Date.now() - BASE_TS * 1000) / 86400000))
}

/** 当前秒级时间戳。 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** 把前端传来的开关值收敛为 1 / 2 两态（非法值取 fallback）。 */
export function toFlag(value: unknown, fallback: 1 | 2 = 1): number {
  const num = Number(value)
  return num === 1 || num === 2 ? num : fallback
}

/* -------------------------------------------------------------------------- */
/*                                树构建                                       */
/* -------------------------------------------------------------------------- */

/** 把扁平的菜单行组装成前端要的嵌套树。 */
export function menuTree(rootId = 0): Array<MenuRow & { children: unknown[] }> {
  const build = (parentId: number): Array<MenuRow & { children: unknown[] }> =>
    db.menus
      .filter((m) => m.parent_id === parentId)
      .sort((a, b) => a.sort - b.sort || a.menu_id - b.menu_id)
      .map((m) => ({ ...m, children: build(m.menu_id) }))

  return build(rootId)
}

/** 某角色被授权的菜单 id 集合（`role_menus` 关联表的读取封装）。 */
export function menuIdsOfRole(roleId: number): Set<number> {
  return new Set(db.roleMenus.filter((rm) => rm.role_id === roleId).map((rm) => rm.menu_id))
}

/**
 * 按「可见菜单 id 集合」裁剪出的菜单树。
 *
 * 导航接口用它把 `role_menus` 的授权结果变成树。注意**不改变层级语义**：
 * 父节点被授权、子节点没被授权时，子节点会被剔除；
 * 父节点没被授权时，它整支都不出现（即使子节点在授权列表里）。
 */
export function visibleMenuTree(
  visibleIds: Set<number>,
): Array<MenuRow & { children: unknown[] }> {
  const build = (parentId: number): Array<MenuRow & { children: unknown[] }> =>
    db.menus
      .filter((m) => m.parent_id === parentId && visibleIds.has(m.menu_id))
      .sort((a, b) => a.sort - b.sort || a.menu_id - b.menu_id)
      .map((m) => ({ ...m, children: build(m.menu_id) }))

  return build(0)
}

/** 分类树（`/data_dict/type/tree` 返回整棵树的顶层数组）。 */
export function dictTypeTree(parentId = 0): Array<DictTypeRow & { children: unknown[] }> {
  const build = (pid: number): Array<DictTypeRow & { children: unknown[] }> =>
    db.dictTypes
      .filter((t) => t.parent_id === pid)
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .map((t) => ({ ...t, children: build(t.id) }))

  return build(parentId)
}

/** 递归收集某节点及其所有后代的 id（用于按分类过滤字典项）。 */
export function dictTypeWithDescendants(typeId: number): number[] {
  const ids = [typeId]
  const walk = (pid: number) => {
    for (const child of db.dictTypes.filter((t) => t.parent_id === pid)) {
      ids.push(child.id)
      walk(child.id)
    }
  }
  walk(typeId)
  return ids
}

export function newDictTypeRow(row: Omit<DictTypeRow, 'p_code' | 'id_path' | 'created_at' | 'updated_at'>): DictTypeRow {
  const parent = db.dictTypes.find((t) => t.id === row.parent_id)
  const grand = parent ? db.dictTypes.find((t) => t.id === parent.parent_id) : undefined
  const ids = [grand?.id, parent?.id].filter((v): v is number => typeof v === 'number')
  const ts = nowSeconds()
  return {
    ...row,
    p_code: [grand?.code, parent?.code, row.code].filter(Boolean).join('.'),
    id_path: `/0/${ids.map((id) => `${id}/`).join('')}`,
    created_at: ts,
    updated_at: ts,
  }
}

/** 分类 code 变化时，同步刷新其后代与所属字典项的派生字段。 */
export function refreshDictDerived(): void {
  const byId = new Map(db.dictTypes.map((t) => [t.id, t]))
  for (const type of db.dictTypes) {
    const parent = byId.get(type.parent_id)
    const grand = parent ? byId.get(parent.parent_id) : undefined
    const ids = [grand?.id, parent?.id].filter((v): v is number => typeof v === 'number')
    type.p_code = [grand?.code, parent?.code, type.code].filter(Boolean).join('.')
    type.id_path = `/0/${ids.map((id) => `${id}/`).join('')}`
  }
  for (const item of db.dictItems) {
    item.code = byId.get(item.type_id)?.p_code ?? ''
  }
}
