/**
 * **页面目录**（AI 侧的页面索引）—— 每个业务页面一条 `desc`，供模型**模糊检索**。
 *
 * ## 为什么不把每页的完整上下文直接发给模型
 *
 * `feature.ts` 里一页的完整声明（接口 + 字段 + 表单 + 搜索参数）动辄几 KB，
 * 全量下发给模型既浪费上下文、又把真正相关的信息稀释掉。所以分两步走：
 *
 * 1. **检索**（本文件 + `search_pages` 工具）：只用**标题 + 一句话描述 + 权限点**
 *    回答"后台里有哪些页面、哪个跟我的需求相关"；命中后模型再看这一页的明细。
 * 2. **取明细**（`get_page_context` 的 `path` 参数）：拿到某一页真实用到的接口与参数。
 *
 * 这既是**上下文约束**（只给得起的那几页），也天然是一道**过滤点**：
 * 将来按权限收窄可见页面，条件加在 `searchPageCatalog` 一处即可。
 *
 * ## 唯一真值约定
 *
 * 目录里的 `path` **必须与导航配置（`NAV_GROUPS`）一致** —— 这里只补"给模型看的描述"，
 * 不另立一套路由表。加页面时先加进导航，再来这里补一行 desc（没有 desc 的页面
 * 检索不到，模型会当它不存在）。
 *
 * 详情页（`/example/table/10001`）不进目录：它们没有独立的 `desc`，靠所属列表页的
 * 描述 + `get_page_context` 按路由模板识别。
 */

export interface AiPageCatalogEndpoint {
  method: string
  /** openapi 里的原始路径（可带 `{id}` 模板） */
  path: string
  /** 这个接口在这一页里用来做什么（比接口自己的 summary 更贴场景） */
  purpose?: string
}

export interface AiPageCatalogEntry {
  /** 相对 appId 的路径（与 `NAV_GROUPS` 的 `to` 逐字一致） */
  path: string
  /** 页面名（与导航项一致；检索结果里给模型看的标题） */
  title: string
  /** 这一页是干什么的 —— **一句话**，写清"能查什么 / 能改什么"，模型靠它判断相关性 */
  desc: string
  /** 这一页涉及的业务名词（帮模型把用户口语对上页面概念） */
  entities?: readonly string[]
  /**
   * 访问这一页所需的权限点（说明性）：模型据此知道"用户没权限看到这一页"时
   * 该如实说，而不是硬编一个替代方案。
   */
  permission?: string
  /** 检索关键词（中英文别名，补 title/desc 覆盖不到的叫法） */
  keywords?: readonly string[]
  /**
   * 这一页用到的接口（method + 路径）。
   *
   * 它让模型能做**跨页面数据聚合**：不必先跳过去，直接按目录里的接口 `call_read_api`
   * 取数，几页的数据在对话里汇总成一份统计（参数的明细由 `endpoint-specs` 自动补，
   * 所以这里**只写 method + path，不要手写参数**）。
   */
  endpoints?: readonly AiPageCatalogEndpoint[]
}

/**
 * 业务页面目录 —— 顺序即展示顺序。
 *
 * `desc` 的写法约定：**动词 + 对象 + 范围**，例如「分页浏览并增删改表格示例记录」。
 * 不要写"这是一个管理页面"这种没有信息量的话 —— 检索质量完全取决于这一句。
 */
export const AI_PAGE_CATALOG: readonly AiPageCatalogEntry[] = [
  {
    path: '/home',
    title: '仪表盘',
    desc: '总览页：展示各类业务指标的汇总卡片，可快速跳转到各业务模块。',
    entities: ['概览', '统计'],
  },
  {
    path: '/example/table',
    title: '表格示例',
    desc: '分页浏览记录列表，支持关键词搜索、多字段筛选与排序，可新建、编辑、单个或批量删除记录，点击行查看详情。',
    entities: ['记录', '昵称', '邮箱', '注册时间'],
    permission: 'table-example:read',
    keywords: ['表格', '用户', 'records', 'table', 'crud'],
    endpoints: [
      { method: 'GET', path: '/user', purpose: '分页查询记录列表（支持 kw 与多字段筛选）' },
      { method: 'POST', path: '/user', purpose: '新建记录' },
      { method: 'PUT', path: '/user', purpose: '更新记录' },
      { method: 'DELETE', path: '/user/{id}', purpose: '删除单条记录' },
      { method: 'POST', path: '/user/batch-delete', purpose: '批量删除记录' },
    ],
  },
  {
    path: '/example/complex-table',
    title: '复杂表格',
    desc: '复杂表格能力示例：分组表头、可展开的父子行、列显隐与汇总行；数据为前端本地构造，不可增删改。',
    entities: ['订单', '明细', '汇总'],
    permission: 'table-example:read',
    keywords: ['复杂表格', '分组', '展开', 'complex'],
  },
  {
    path: '/example/tickets',
    title: '工单管理',
    desc: '工单的增删改查示例：**后端只提供单条删除与单条更新接口，没有批量接口**；状态变更走独立的状态接口。适合批量操作的编排演示。',
    entities: ['工单', '状态', '优先级', '负责人'],
    permission: 'ticket:read',
    keywords: ['工单', 'ticket', '批量', '状态'],
    endpoints: [
      { method: 'GET', path: '/ticket', purpose: '分页查询工单（状态 / 优先级 / 分类筛选）' },
      { method: 'GET', path: '/ticket/{id}', purpose: '读取单条工单详情' },
      { method: 'POST', path: '/ticket', purpose: '新建工单' },
      { method: 'PUT', path: '/ticket', purpose: '更新单条工单（body 带 id）' },
      {
        method: 'DELETE',
        path: '/ticket/{id}',
        purpose: '删除单条工单（**无批量端点**，批量需编排多次调用）',
      },
      {
        method: 'PATCH',
        path: '/ticket/{id}/status',
        purpose: '变更单条工单状态（body { status }）',
      },
    ],
  },
  {
    path: '/system/menus',
    title: '菜单管理',
    desc: '维护后台的目录 / 菜单 / 操作三级树，配置每项的路径、图标、权限点与关联接口；可新建、编辑、删除节点。',
    entities: ['目录', '菜单', '操作', '权限点'],
    permission: 'feature:read',
    keywords: ['菜单', '功能', 'menu', '权限'],
    endpoints: [
      { method: 'GET', path: '/system/menu/tree', purpose: '读取菜单树' },
      { method: 'POST', path: '/system/menu', purpose: '新建菜单' },
      { method: 'PUT', path: '/system/menu', purpose: '更新菜单' },
      { method: 'DELETE', path: '/system/menu/{id}', purpose: '删除菜单（连同下级）' },
    ],
  },
  {
    path: '/system/data-dict',
    title: '数据字典',
    desc: '维护字典分类树与其下的字典项（值 → 文案），供全站枚举字段翻译；可新建、编辑、删除分类与字典项。',
    entities: ['字典分类', '字典项', '枚举'],
    permission: 'dict:read',
    keywords: ['字典', '枚举', 'dict', 'options'],
    endpoints: [
      { method: 'GET', path: '/data_dict', purpose: '分页查询字典项' },
      { method: 'GET', path: '/data_dict/type/tree', purpose: '读取字典分类树' },
      { method: 'GET', path: '/data_dict/options', purpose: '读取全量字典选项' },
      { method: 'POST', path: '/data_dict', purpose: '新建字典项' },
      { method: 'PUT', path: '/data_dict', purpose: '更新字典项' },
      { method: 'DELETE', path: '/data_dict/{id}', purpose: '删除字典项' },
    ],
  },
  {
    path: '/system/roles',
    title: '角色管理',
    desc: '维护角色及其菜单授权：可新建、编辑、删除角色，并配置每个角色能在导航里看到哪些菜单。',
    entities: ['角色', '菜单授权', 'RBAC'],
    permission: 'role:read',
    keywords: ['角色', '权限', 'role', 'rbac'],
    endpoints: [
      { method: 'GET', path: '/role', purpose: '分页查询角色' },
      { method: 'GET', path: '/role/{id}', purpose: '读取角色详情' },
      { method: 'GET', path: '/role/menus', purpose: '查询角色的菜单授权' },
      { method: 'PUT', path: '/role/menus', purpose: '覆盖角色的菜单授权' },
      { method: 'POST', path: '/role', purpose: '新建角色' },
      { method: 'PUT', path: '/role', purpose: '更新角色' },
      { method: 'DELETE', path: '/role/{id}', purpose: '删除角色' },
    ],
  },
]

/**
 * **模糊检索页面目录** —— 给模型看的"后台里有什么"。
 *
 * 匹配范围：**标题 / 描述 / 业务名词 / 关键词**（都对用户的口语友好），大小写不敏感。
 * 只返回**标题 + 描述**这类轻量信息（外加路径与权限点），**不带**接口与字段明细 ——
 * 那要等模型确定了目标页再单独取（`get_page_context`）。
 *
 * 关键词为空时返回全部（模型只是想看看有哪些页面）。命中过多时只给前 `limit` 条并说明。
 */
export function searchPageCatalog(
  keyword: string,
  limit = 12,
  /** 是否在结果里带上每页的接口清单（跨页面聚合需要；默认带） */
  withEndpoints = true,
): { total: number; items: AiPageCatalogEntry[] } {
  const query = keyword.trim().toLowerCase()
  const matched = query
    ? AI_PAGE_CATALOG.filter((entry) => {
        const haystack = [
          entry.title,
          entry.desc,
          ...(entry.entities ?? []),
          ...(entry.keywords ?? []),
        ]
          .join(' ')
          .toLowerCase()
        // 逐字包含即可：中文检索不需要分词，模型给的多是词或短语
        return haystack.includes(query)
      })
    : [...AI_PAGE_CATALOG]

  const items = matched
    .slice(0, limit)
    .map((entry) => (withEndpoints ? entry : { ...entry, endpoints: undefined }))
  return { total: matched.length, items }
}

/** 按路径精确取一条目录项（`get_page_context` 用它识别"模型指的是哪一页"）。 */
export function findPageCatalogEntry(path: string): AiPageCatalogEntry | undefined {
  return AI_PAGE_CATALOG.find((entry) => entry.path === path)
}
