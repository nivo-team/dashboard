/**
 * Mock API 冒烟测试：覆盖全部接口与写操作闭环。
 *
 * 用法：node scripts/smoke.mjs [baseUrl]
 * 默认 http://localhost:3001
 */
const BASE = process.argv[2] || 'http://localhost:3001'

let passed = 0
let failed = 0

/**
 * 当前请求使用的授权 token。
 *
 * 默认值是一个**真实存在的**账号 token（`admin`）—— 旧值 `mock-token` 已不再签发，
 * 用它会让所有接口按「未知 token → 兜底账号」处理，测出来的身份与断言无关。
 * 登录小节会用**登录返回的 token** 覆盖它，因此「登录签发 → 后续按 token 识别身份」
 * 这条链也在冒烟范围内。
 */
let authToken = 'mock-token-admin'

async function call(method, path, body, token = authToken) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    ...(method !== 'GET' && body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json, text }
}

function check(label, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`)
  } else {
    failed++
    console.log(`  ✗ ${label}  ${detail}`)
  }
}

console.log(`\n目标: ${BASE}\n`)

/* ------------------------------------------------------------ 跨域（CORS） */
// node 的 fetch 不会像浏览器那样自动发预检，所以这里手动模拟一次：
// 漏配 CORS 时业务请求在浏览器里会直接 net::ERR_FAILED，而普通接口测试完全测不出来。
console.log('跨域')
const preflight = await fetch(`${BASE}/login`, {
  method: 'OPTIONS',
  headers: {
    origin: 'http://localhost:3000',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
  },
})
check('OPTIONS 预检返回 204', preflight.status === 204, 'HTTP ' + preflight.status)
check(
  '回显请求来源',
  preflight.headers.get('access-control-allow-origin') === 'http://localhost:3000',
  preflight.headers.get('access-control-allow-origin') ?? '(缺失)',
)
const allowHeaders = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase()
check('预检允许 authorization', allowHeaders.includes('authorization'))
check('预检允许 x-app-id', allowHeaders.includes('x-app-id'))
check('带 Vary: Origin', (preflight.headers.get('vary') ?? '').includes('Origin'))

/* ---------------------------------------------------------------- 认证 */
console.log('认证')
// 只认三个预设测试账号，密码统一 123（见 server/utils/mock-accounts.ts）
const login = await call('POST', '/login', { username: 'admin', password: '123' })
check(
  'POST /login',
  login.json?.code === 0 && !!login.json?.result?.token,
  `token=${login.json?.result?.token}`,
)

const loginBad = await call('POST', '/login', { username: '', password: '' })
check('空账号被拒绝', loginBad.json?.code === 400, loginBad.json?.message)

const loginWrongPwd = await call('POST', '/login', { username: 'admin', password: 'wrong' })
check('错误密码被拒绝', loginWrongPwd.json?.code === 400, loginWrongPwd.json?.message)

const loginUnknown = await call('POST', '/login', { username: 'nobody', password: '123' })
check('未知账号被拒绝', loginUnknown.json?.code === 400, loginUnknown.json?.message)

// 后续请求改用登录签发的 token（不再依赖默认值）
if (login.json?.result?.token) authToken = login.json.result.token

const profile = await call('GET', '/profile')
check('GET /profile', profile.json?.code === 0 && profile.json?.result?.username === 'admin')

/* ------------------------------------------------------------ 权限角色 */
// 「角色 → 权限点 → 界面收敛」这条链的真值在 mock 侧：逐个账号登录，
// 确认签发的 token 能被 /permissions 反查成对应角色，且删除权限的有无符合设计。
console.log('\n权限角色')
for (const row of [
  { username: 'super admin', role: 'Super Admin', canDelete: true },
  { username: 'admin', role: 'Admin', canDelete: false },
  { username: 'user', role: 'Viewer', canDelete: false },
]) {
  const signIn = await call('POST', '/login', { username: row.username, password: '123' })
  const token = signIn.json?.result?.token
  check(`登录 ${row.username} 拿到 token`, !!token, token)

  const perms = await call('GET', '/permissions', undefined, token)
  check(
    `${row.username} → role ${row.role}`,
    perms.json?.result?.role === row.role,
    perms.json?.result?.role,
  )

  const list = perms.json?.result?.permissions ?? []
  const hasDelete = list.some((p) => p.endsWith(':delete'))
  check(
    `${row.username} 删除权限 = ${row.canDelete}`,
    hasDelete === row.canDelete,
    `${list.length} 个权限点`,
  )

  const prof = await call('GET', '/profile', undefined, token)
  check(
    `${row.username} 的 profile 与角色一致`,
    prof.json?.result?.role === row.role,
    prof.json?.result?.username,
  )
}

// 还原成 admin 身份，后面的接口测试沿用
authToken = login.json?.result?.token ?? authToken

/* ------------------------------------------------------------ 导航菜单 */
// 身份链：token → 账号 → role 码 → 角色 → role_menus 授权 → 菜单树。
// 导航接口只返回能落地的目录(1)/菜单(2)，且节点必须带路由地址。
console.log('\n导航菜单')
const collectNavIds = (nodes) =>
  nodes.flatMap((n) => [n.menu_id, ...collectNavIds(n.children ?? [])])
const flattenNav = (nodes) => nodes.flatMap((n) => [n, ...flattenNav(n.children ?? [])])
for (const row of [
  { token: 'mock-token-super', code: 'super', hasRoleMenu: true },
  { token: 'mock-token-admin', code: 'editor', hasRoleMenu: true },
  { token: 'mock-token-user', code: 'viewer', hasRoleMenu: false },
]) {
  const nav = await call('GET', '/menus/navigation', undefined, row.token)
  check(`${row.code} 导航可达`, nav.json?.code === 0)
  check(
    `${row.code} 角色解析`,
    nav.json?.result?.role?.code === row.code,
    nav.json?.result?.role?.code,
  )
  const nodes = flattenNav(nav.json?.result?.items ?? [])
  check(
    `${row.code} 导航不含操作节点`,
    nodes.every((n) => n.menu_type !== 3),
  )
  check(
    `${row.code} 目录/菜单都有路由地址`,
    nodes.every((n) => typeof n.path === 'string' && n.path.startsWith('/')),
  )
  check(
    `${row.code} 菜单授权生效（角色管理 = ${row.hasRoleMenu}）`,
    collectNavIds(nav.json?.result?.items ?? []).includes(40) === row.hasRoleMenu,
  )
}

/* ------------------------------------------------------------ 角色管理 */
console.log('\n角色管理')
const roles = await call('GET', '/role')
check(
  'GET /role',
  roles.json?.code === 0 && (roles.json?.result?.total ?? 0) >= 3,
  `total=${roles.json?.result?.total}`,
)
check(
  '列表带 menu_count',
  (roles.json?.result?.items ?? []).every((r) => typeof r.menu_count === 'number'),
)

// 幂等：清掉上一次跑残留的同名角色，否则「重复角色码被拒」那条会因为 POST 失败而误报
const staleRoles = (await call('GET', '/role?kw=smoke_role')).json?.result?.items ?? []
for (const stale of staleRoles) {
  await call('DELETE', `/role/${stale.id}`)
}

const newRole = await call('POST', '/role', { name: '冒烟角色', code: 'smoke_role' })
check(
  'POST /role',
  newRole.json?.code === 0 && newRole.json?.result?.code === 'smoke_role',
  `id=${newRole.json?.result?.id}`,
)
check(
  '重复角色码被拒',
  (await call('POST', '/role', { name: 'x', code: 'smoke_role' })).json?.code === 400,
)

const roleId = newRole.json?.result?.id
if (roleId) {
  check(
    'PUT /role',
    (await call('PUT', '/role', { id: roleId, name: '冒烟角色2' })).json?.result?.name ===
      '冒烟角色2',
  )
  check('内置角色不可删', (await call('DELETE', '/role/3')).json?.code === 400)

  const before = (await call('GET', '/role/menus?role_id=1')).json?.result?.menu_ids?.length
  const granted = await call('PUT', '/role/menus', {
    role_id: roleId,
    menu_ids: [1, 10, 11, 999999],
  })
  check(
    'PUT /role/menus 忽略未知菜单 id',
    JSON.stringify(granted.json?.result?.menu_ids) === JSON.stringify([1, 10, 11]),
    JSON.stringify(granted.json?.result?.menu_ids),
  )
  check(
    '角色授权互不影响',
    (await call('GET', '/role/menus?role_id=1')).json?.result?.menu_ids?.length === before,
  )

  check('DELETE /role/{id}', (await call('DELETE', `/role/${roleId}`)).json?.code === 0)
  check('删除后授权已清理', (await call('GET', `/role/menus?role_id=${roleId}`)).json?.code === 404)
}

/* ------------------------------------------------------------ 应用列表 */
console.log('\n应用列表')
const apps = await call('GET', '/apps')
const appList = apps.json?.result ?? []
check('GET /apps', apps.json?.code === 0 && appList.length > 0, `${appList.length} 个应用`)
check(
  '每个应用都带 apiBaseUrl',
  appList.every((a) => !!a.apiBaseUrl),
  appList.map((a) => a.id).join(', '),
)
check(
  'apiBaseUrl 指向本 Mock',
  appList.every((a) => a.apiBaseUrl.includes(new URL(BASE).host)),
)

/* -------------------------------------------------------- 系统接口清单 */
console.log('\n系统接口清单')
const apiList = await call('GET', '/api')
check(
  'GET /api',
  apiList.json?.code === 0 && (apiList.json?.result?.length ?? 0) > 0,
  `${apiList.json?.result?.length} 条`,
)
check(
  '清单项字段完整',
  (apiList.json?.result ?? []).every((i) => i.label && i.method && i.path && i.value),
)

/* ---------------------------------------------------------------- 用户 */
console.log('\n用户')
const users = await call('GET', '/user?page=1&page_size=5')
check(
  'GET /user 分页',
  users.json?.result?.items?.length === 5,
  `total=${users.json?.result?.total}`,
)
const users2 = await call('GET', '/user?page=2&page_size=5')
const ids1 = (users.json?.result?.items ?? []).map((u) => u.id)
const ids2 = (users2.json?.result?.items ?? []).map((u) => u.id)
check('跨页 id 不重复', !ids1.some((id) => ids2.includes(id)), `${ids1[0]}..${ids2[0]}`)
const search = await call('GET', `/user?kw=${encodeURIComponent('星空')}`)
check(
  'kw 搜索生效',
  search.json?.result?.total <= users.json?.result?.total,
  `命中 ${search.json?.result?.total}`,
)

// 服务端排序验证
const sortedAsc = await call('GET', '/user?page=1&page_size=3&field=id&order=asc')
const sortedDesc = await call('GET', '/user?page=1&page_size=3&field=id&order=desc')
const ascIds = (sortedAsc.json?.result?.items ?? []).map((u) => u.id)
const descIds = (sortedDesc.json?.result?.items ?? []).map((u) => u.id)
check(
  '服务端排序生效 (field=id order=asc/desc)',
  ascIds[0] < descIds[0],
  `asc=${ascIds[0]} desc=${descIds[0]}`,
)

// 用户 CRUD 闭环验证
const createdUser = await call('POST', '/user', {
  nickname: '冒烟测试用户',
  email: 'smoke_user@example.com',
  avatar_url: 'https://example.com/avatar.png',
})
const newUserId = createdUser.json?.result?.id
check('POST /user 创建用户', createdUser.json?.code === 0 && !!newUserId, `id=${newUserId}`)

const userDetail = await call('GET', `/user/${newUserId}`)
check(
  'GET /user/{id} 查询详情',
  userDetail.json?.code === 0 && userDetail.json?.result?.nickname === '冒烟测试用户',
)

const updatedUser = await call('PUT', '/user', {
  id: newUserId,
  nickname: '冒烟测试用户-已改名',
  email: 'smoke_user_mod@example.com',
})
check(
  'PUT /user 更新用户',
  updatedUser.json?.code === 0 && updatedUser.json?.result?.nickname === '冒烟测试用户-已改名',
)

// 过滤参数验证
const filterUser = await call('GET', `/user?email=smoke_user_mod@example.com`)
check(
  '多字段过滤生效 (email)',
  (filterUser.json?.result?.items ?? []).some((u) => u.id === newUserId),
)

// 单项删除验证
const deletedSingle = await call('DELETE', `/user/${newUserId}`)
check('DELETE /user/{id} 单项删除', deletedSingle.json?.code === 0)
const deletedDetail = await call('GET', `/user/${newUserId}`)
check('删除后 GET /user/{id} 返回 404', deletedDetail.json?.code === 404)

// 批量删除验证
const batchUser1 = await call('POST', '/user', {
  nickname: '批量用户1',
  email: 'batch1@example.com',
})
const batchUser2 = await call('POST', '/user', {
  nickname: '批量用户2',
  email: 'batch2@example.com',
})
const bId1 = batchUser1.json?.result?.id
const bId2 = batchUser2.json?.result?.id
check('创建批量测试用户', !!bId1 && !!bId2)

const batchDeleteRes = await call('POST', '/user/batch-delete', { ids: [bId1, bId2] })
check(
  'POST /user/batch-delete 批量删除',
  batchDeleteRes.json?.code === 0 && batchDeleteRes.json?.result?.deleted_count === 2,
  `deleted=${batchDeleteRes.json?.result?.deleted_count}`,
)
const batchVerify1 = await call('GET', `/user/${bId1}`)
const batchVerify2 = await call('GET', `/user/${bId2}`)
check('批量删除后用户不存在', batchVerify1.json?.code === 404 && batchVerify2.json?.code === 404)

/* ------------------------------------------------------------ 功能菜单 */
console.log('\n功能菜单')
const tree = await call('GET', '/system/menu/tree')
const roots = tree.json?.result ?? []
check('GET /system/menu/tree', tree.json?.code === 0 && roots.length > 0, `顶层 ${roots.length} 个`)
check(
  '树是嵌套结构',
  roots.some((n) => Array.isArray(n.children) && n.children.length > 0),
)

const created = await call('POST', '/system/menu', {
  menu_name: '冒烟测试功能',
  parent_id: roots[0].menu_id,
  menu_type: 3,
  permission: 'smoke:test',
})
const newMenuId = created.json?.result?.menu_id
check('POST /system/menu', created.json?.code === 0 && !!newMenuId, `menu_id=${newMenuId}`)

const treeAfterCreate = await call('GET', '/system/menu/tree')
check(
  '新建后立刻出现在树里（写操作真实生效）',
  JSON.stringify(treeAfterCreate.json?.result ?? []).includes('冒烟测试功能'),
)

const updated = await call('PUT', '/system/menu', {
  menu_id: newMenuId,
  menu_name: '冒烟测试功能-已改',
})
check(
  'PUT /system/menu',
  updated.json?.code === 0 && updated.json?.result?.menu_name === '冒烟测试功能-已改',
)

const delMenu = await call('DELETE', `/system/menu/${newMenuId}`)
check('DELETE /system/menu/{id}', delMenu.json?.code === 0)
const treeAfterDelete = await call('GET', '/system/menu/tree')
check(
  '删除后不再出现',
  !JSON.stringify(treeAfterDelete.json?.result ?? []).includes('冒烟测试功能'),
)

/* ------------------------------------------------------------ 数据字典 */
console.log('\n数据字典')
const dictTypes = await call('GET', '/data_dict/type/tree')
const typeRoots = dictTypes.json?.result ?? []
check(
  'GET /data_dict/type/tree',
  dictTypes.json?.code === 0 && typeRoots.length > 0,
  `顶层 ${typeRoots.length} 个`,
)
check(
  '分类节点带 p_code',
  typeRoots.some((t) => t.children?.some((c) => c.p_code?.includes('.'))),
)

const dictItems = await call('GET', '/data_dict?page=1&page_size=5')
check(
  'GET /data_dict 返回 {total,items}',
  typeof dictItems.json?.result?.total === 'number' && Array.isArray(dictItems.json?.result?.items),
  `total=${dictItems.json?.result?.total}`,
)

const options = await call('GET', '/data_dict/options')
const optionKeys = Object.keys(options.json?.result ?? {})
check(
  'GET /data_dict/options',
  options.json?.code === 0 && optionKeys.length > 0,
  optionKeys.join(', '),
)
check(
  '选项 key 是两段式逻辑码（不含临时命名空间）',
  optionKeys.every((k) => k.includes('.') && !k.startsWith('new.')),
  optionKeys.join(', '),
)

const leafTypeId = (dictItems.json?.result?.items ?? [])[0]?.type_id
const newItem = await call('POST', '/data_dict', {
  type_id: leafTypeId,
  label: '冒烟项',
  value: 'smoke-value',
})
const newItemId = newItem.json?.result?.id
check('POST /data_dict', newItem.json?.code === 0 && !!newItemId, `id=${newItemId}`)

const dupItem = await call('POST', '/data_dict', {
  type_id: leafTypeId,
  label: '重复项',
  value: 'smoke-value',
})
check('同分类下键值重复被拒绝', dupItem.json?.code === 400, dupItem.json?.message)

const putItem = await call('PUT', '/data_dict', { id: newItemId, label: '冒烟项-已改' })
check('PUT /data_dict', putItem.json?.code === 0 && putItem.json?.result?.label === '冒烟项-已改')

const delItem = await call('DELETE', `/data_dict/${newItemId}`)
check('DELETE /data_dict/{id}', delItem.json?.code === 0)

const newType = await call('POST', '/data_dict/type', {
  name: '冒烟分类',
  code: 'smoke-type',
  parent_id: 0,
  type: 1,
})
const newTypeId = newType.json?.result?.id
check('POST /data_dict/type', newType.json?.code === 0 && !!newTypeId, `id=${newTypeId}`)

const badCode = await call('POST', '/data_dict/type', {
  name: '非法编码',
  code: 'BadCode',
  parent_id: 0,
})
check('非法 code 被拒绝', badCode.json?.code === 400, badCode.json?.message)

const putType = await call('PUT', '/data_dict/type', { id: newTypeId, name: '冒烟分类-已改' })
check(
  'PUT /data_dict/type',
  putType.json?.code === 0 && putType.json?.result?.name === '冒烟分类-已改',
)

const blocked = await call('DELETE', `/data_dict/type/${leafTypeId}`)
check('有字典项的分类不允许删除', blocked.json?.code === 400, blocked.json?.message)

const delType = await call('DELETE', `/data_dict/type/${newTypeId}`)
check('DELETE /data_dict/type/{id}', delType.json?.code === 0)

/* ---------------------------------------------------------------- 契约 */
console.log('\n契约生成')
const spec = await call('GET', '/openapi.json')
// 业务路径不带统一前缀，因此用「排除框架路由」的方式筛
const paths = Object.keys(spec.json?.paths ?? {}).filter(
  (p) => !p.startsWith('/_') && p !== '/openapi.json',
)
const expected = [
  '/login',
  '/profile',
  '/permissions',
  '/apps',
  '/api',
  '/user',
  '/menus/navigation',
  '/role',
  '/role/{id}',
  '/role/menus',
  '/system/menu/tree',
  '/system/menu',
  '/system/menu/{id}',
  '/data_dict',
  '/data_dict/{id}',
  '/data_dict/options',
  '/data_dict/type/tree',
  '/data_dict/type',
  '/data_dict/type/{id}',
]
check('契约可达', spec.status === 200 && !!spec.json?.paths)
check('契约版本 3.1', spec.json?.openapi === '3.1.0', spec.json?.openapi)
const missing = expected.filter((p) => !paths.includes(p))
check(
  '全部业务接口都在契约里',
  missing.length === 0,
  missing.length ? '缺失 ' + missing.join(', ') : `${paths.length} 个路径`,
)
const schemaNames = Object.keys(spec.json?.components?.schemas ?? {})
check('共享 schema 已提升到 components', schemaNames.length > 0, `${schemaNames.length} 个`)
const dictResp =
  spec.json?.paths?.['/data_dict']?.get?.responses?.['200']?.content?.['application/json']?.schema
check(
  '契约如实声明分页结构（不再是 v1.DataOptions）',
  JSON.stringify(dictResp ?? '').includes('DictItemPageResult'),
)

/* ---------------------------------------------------------------- 汇总 */
console.log(`\n通过 ${passed} 项，失败 ${failed} 项\n`)
process.exit(failed === 0 ? 0 : 1)
