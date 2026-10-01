/**
 * Mock 测试账号 —— **唯一真值**。
 *
 * 有三处必须按「登录的是谁」区分行为：
 * - `login.post.ts`：校验账号密码，并发出对应的 token；
 * - `permissions.get.ts`：按 token 反查角色，返回该角色的权限点清单；
 * - `profile.get.ts`：按 token 反查角色，返回该账号的用户信息。
 *
 * 原先这三处各自写一份 `token.includes('super')` / `token.includes('admin')`
 * 之类的子串猜测：加一个账号、改一个角色名时就必然漏掉一处，而且
 * `mock-token-super` 这种命名让子串判断本来就靠不住（`super` 里不含 `admin`，
 * 纯属巧合；换个 token 名立刻失效）。现在统一从这里出。
 */
export type MockRole = 'super' | 'editor' | 'viewer'

export interface MockAccount {
  /** 登录账号（展示用，也是登录页快捷选择的值）。 */
  username: string
  /** 等价登录名；大小写不敏感地精确匹配。 */
  aliases: string[]
  /** 测试密码：全账号统一为 `123`（登录页的 DEMO 快捷填充用的是同一个值）。 */
  password: string
  /** 权限角色：真实角色 → 权限点的映射在 `permissions.get.ts` 的 `ROLE_PERMISSIONS`。 */
  role: MockRole
  /** 角色展示名（返回给前端 `result.role`，超管判定只认 `Super Admin` 这一种写法）。 */
  roleName: string
  uid: number
  /** 登录成功后签发的 token，也是其余接口识别身份的依据。 */
  token: string
  nickName: string
  email: string
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    username: 'super admin',
    aliases: ['super admin', 'superadmin', 'super_admin'],
    password: '123',
    role: 'super',
    roleName: 'Super Admin',
    uid: 1,
    token: 'mock-token-super',
    nickName: '超级管理员',
    email: 'superadmin@example.com',
  },
  {
    username: 'admin',
    aliases: ['admin'],
    password: '123',
    // 业务管理员：能建能改、**不能删**（见 ROLE_PERMISSIONS.editor 过滤掉 :delete）
    role: 'editor',
    roleName: 'Admin',
    uid: 2,
    token: 'mock-token-admin',
    nickName: '业务管理员',
    email: 'admin@example.com',
  },
  {
    username: 'user',
    aliases: ['user'],
    password: '123',
    // 普通访客：只读
    role: 'viewer',
    roleName: 'Viewer',
    uid: 3,
    token: 'mock-token-user',
    nickName: '普通查看用户',
    email: 'user@example.com',
  },
]

/** 兜底账号：没有 token / token 不认识时按它处理（保持「零配置能进系统」）。 */
export const DEFAULT_MOCK_ACCOUNT = MOCK_ACCOUNTS[0]

/** 取出 `Authorization: Bearer xxx` 里的裸 token（无前缀也接受，去掉空白）。 */
export function parseBearerToken(authHeader?: string | null): string {
  return (authHeader ?? '').replace(/^Bearer\s+/i, '').trim()
}

/** 按 token **精确**反查账号；未知 token 返回 `undefined`，由调用方决定回落策略。 */
export function findAccountByToken(authHeader?: string | null): MockAccount | undefined {
  const token = parseBearerToken(authHeader)
  if (!token) return undefined
  return MOCK_ACCOUNTS.find((account) => account.token === token)
}

/** 按登录名（含别名）反查账号，大小写不敏感。 */
export function findAccountByUsername(username?: string | null): MockAccount | undefined {
  const normalized = (username ?? '').trim().toLowerCase()
  if (!normalized) return undefined
  return MOCK_ACCOUNTS.find(
    (account) =>
      account.username.toLowerCase() === normalized ||
      account.aliases.some((alias) => alias.toLowerCase() === normalized),
  )
}
