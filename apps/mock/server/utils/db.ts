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
  /** 1 功能组（目录）/ 2 功能（菜单）/ 3 操作（权限点） */
  menu_type: number
  path: string
  component: string
  route_name: string
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

/** 功能菜单：一棵干净的三层功能树（功能组 → 功能 → 操作）。 */
function seedMenus(): MenuRow[] {
  const rows: Array<Partial<MenuRow> & { menu_id: number; parent_id: number; menu_name: string; menu_type: number }> = [
    { menu_id: 1, parent_id: 0, menu_name: '工作台', menu_type: 1, icon: 'GaugeIcon', sort: 1 },
    { menu_id: 2, parent_id: 1, menu_name: '概览', menu_type: 2, route_name: 'dashboard', sort: 1 },

    { menu_id: 10, parent_id: 0, menu_name: '系统管理', menu_type: 1, icon: 'GearSixIcon', sort: 2 },

    { menu_id: 11, parent_id: 10, menu_name: '用户管理', menu_type: 2, route_name: 'users', sort: 1 },
    { menu_id: 12, parent_id: 11, menu_name: '查看用户', menu_type: 3, permission: 'user:view', sort: 1 },
    { menu_id: 13, parent_id: 11, menu_name: '编辑用户', menu_type: 3, permission: 'user:edit', sort: 2 },
    { menu_id: 14, parent_id: 11, menu_name: '导出用户', menu_type: 3, permission: 'user:export', sort: 3 },

    { menu_id: 20, parent_id: 10, menu_name: '数据字典', menu_type: 2, route_name: 'data-dict', sort: 2 },
    { menu_id: 21, parent_id: 20, menu_name: '查看字典', menu_type: 3, permission: 'dict:view', sort: 1 },
    { menu_id: 22, parent_id: 20, menu_name: '编辑字典', menu_type: 3, permission: 'dict:edit', sort: 2 },

    { menu_id: 30, parent_id: 10, menu_name: '功能管理', menu_type: 2, route_name: 'features', sort: 3 },
    { menu_id: 31, parent_id: 30, menu_name: '查看功能', menu_type: 3, permission: 'feature:view', sort: 1 },
    { menu_id: 32, parent_id: 30, menu_name: '编辑功能', menu_type: 3, permission: 'feature:edit', sort: 2 },
  ]

  return rows.map((row, index) => ({
    path: '/ignore',
    component: '/ignore',
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
  dictTypes: seedDictTypes(),
  dictItems: seedDictItems(),
  users: seedUsers(),
  apps: seedApps(),
}

/** 内存自增 id（分开计数，避免不同实体互相干扰）。 */
export const seq = {
  menu: 100,
  dictType: 100,
  dictItem: 2000,
  user: 20000,
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
