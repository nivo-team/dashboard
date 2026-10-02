import type { UserItem } from '#/api'

/**
 * 记录模块的演示兜底数据（仅当接口不可用时供界面预览）。
 *
 * 字段与契约保持一致的极简集：标识、昵称、头像、邮箱与两个时间。
 */
export const DEMO_TABLE_EXAMPLE_ROWS: UserItem[] = [
  { id: 10001, nickname: '林望舒', avatar_url: '', email: 'lin.wangshu@example.com', createtime: 1730419200, logintime: 1771920000 },
  { id: 10002, nickname: '运营小助手', avatar_url: '', email: 'ops@example.com', createtime: 1709251200, logintime: 1771923600 },
  { id: 10003, nickname: 'Ahmet Yılmaz', avatar_url: '', email: 'ahmet@example.com', createtime: 1727740800, logintime: 1771900000 },
  { id: 10004, nickname: 'Sara Al-Otaibi', avatar_url: '', email: 'sara@example.com', createtime: 1733011200, logintime: 1771880000 },
  { id: 10005, nickname: '田中 悠', avatar_url: '', email: 'tanaka@example.com', createtime: 1722470400, logintime: 1771850000 },
  { id: 10006, nickname: 'Diego Ramírez', avatar_url: '', email: 'diego@example.com', createtime: 1719792000, logintime: 1771800000 },
  { id: 10007, nickname: 'Nadia Putri', avatar_url: '', email: 'nadia@example.com', createtime: 1735689600, logintime: 1771750000 },
  { id: 10008, nickname: '沈砚', avatar_url: '', email: 'shen.yan@example.com', createtime: 1738368000, logintime: 1771700000 },
]

/** 按 id 取演示记录（详情页在演示模式下用）。 */
export function findDemoTableExampleRow(id: string): UserItem | null {
  const keyword = id.trim()
  if (!keyword) return null
  return DEMO_TABLE_EXAMPLE_ROWS.find((user) => String(user.id) === keyword) ?? null
}
