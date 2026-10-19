import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { computePermissions, normalizeRoleName, usePermissionStore } from './permission-store'

/**
 * 权限判定的回归测试。
 *
 * 这一份的重点是**把踩过的坑钉死**：`Admin` 不是超管（详见
 * .agents/skills/business-development/references/permissions-architecture.md §3），
 * 以及 `VITE_SUPER_ADMIN_ID` 这条「部署期指派超管」的路径。
 */

describe('normalizeRoleName', () => {
  it('抹平大小写与分隔符差异', () => {
    expect(normalizeRoleName('Super-Admin')).toBe('superadmin')
    expect(normalizeRoleName('Super Admin')).toBe('superadmin')
    expect(normalizeRoleName('  SUPER_ADMIN  ')).toBe('superadmin')
  })

  it('空值不炸', () => {
    expect(normalizeRoleName()).toBe('')
  })
})

describe('computePermissions', () => {
  it('Admin 不是超管 —— 判成超管会让「admin 不能删」整条收敛链失效', () => {
    expect(computePermissions([], 'Admin').isSuperAdmin).toBe(false)
    expect(computePermissions(['feature:delete'], 'Admin').isSuperAdmin).toBe(false)
  })

  it('superadmin / super 是超管（大小写与分隔符不敏感）', () => {
    expect(computePermissions([], 'superadmin').isSuperAdmin).toBe(true)
    expect(computePermissions([], 'Super-Admin').isSuperAdmin).toBe(true)
    expect(computePermissions([], 'super').isSuperAdmin).toBe(true)
  })

  it('通配权限点也算超管', () => {
    expect(computePermissions(['*'], 'Admin').isSuperAdmin).toBe(true)
    expect(computePermissions(['*:*'], '').isSuperAdmin).toBe(true)
  })

  it('普通角色只拿到精确命中的权限点', () => {
    const computed = computePermissions(['feature:read', 'dict:read', 'feature:*'], 'editor')
    expect(computed.isSuperAdmin).toBe(false)
    expect(computed.permissionMap).toMatchObject({ 'feature:read': true, 'dict:read': true })
    expect(computed.modules.feature).toMatchObject({ read: true })
    expect(computed.wildcards).toEqual(['feature:*'])
  })

  it('忽略空串权限点（不产生空 module）', () => {
    const computed = computePermissions(['', '  '], 'editor')
    expect(Object.keys(computed.modules)).toEqual([])
  })
})

describe('permission store', () => {
  beforeEach(() => {
    usePermissionStore.getState().resetPermissions()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('setPermissions 写入角色与权限点，并重算 computed', () => {
    usePermissionStore.getState().setPermissions({ role: 'superadmin', permissions: [] })
    const state = usePermissionStore.getState()
    expect(state.role).toBe('superadmin')
    expect(state.computed.isSuperAdmin).toBe(true)
    expect(state.lastUpdated).not.toBeNull()
  })

  it('setPermissions 缺省 role 时回落空串（不会把旧角色留在 store 里）', () => {
    usePermissionStore.getState().setPermissions({ role: 'superadmin', permissions: [] })
    usePermissionStore.getState().setPermissions({ permissions: ['dict:read'] })
    const state = usePermissionStore.getState()
    expect(state.role).toBe('')
    expect(state.computed.isSuperAdmin).toBe(false)
  })

  it('resetPermissions 清空角色、权限点与身份', () => {
    const store = usePermissionStore.getState()
    store.setIdentity({ uid: 42, username: 'someone' })
    store.setPermissions({ role: 'superadmin', permissions: ['*'] })

    usePermissionStore.getState().resetPermissions()
    const state = usePermissionStore.getState()
    expect(state).toMatchObject({ role: '', permissions: [], identity: null, lastUpdated: null })
    expect(state.computed.isSuperAdmin).toBe(false)
  })

  it('身份先写入、权限后到达 —— env 指派的超管在权限接口回来前也生效', async () => {
    vi.stubEnv('VITE_SUPER_ADMIN_ID', '42')
    const { usePermissionStore: freshStore } = await import('./permission-store')

    // 后端下发的是普通角色，命中完全靠 env 里的 id
    freshStore.getState().setIdentity({ uid: 42, username: 'someone' })
    expect(freshStore.getState().computed.isSuperAdmin).toBe(true)

    freshStore.getState().setPermissions({ role: 'Admin', permissions: ['dict:read'] })
    expect(freshStore.getState().computed.isSuperAdmin).toBe(true)
  })

  it('先写权限、后补身份也能补上超管判定（水合顺序反过来也成立）', async () => {
    vi.stubEnv('VITE_SUPER_ADMIN_ID', 'root')
    const { usePermissionStore: freshStore } = await import('./permission-store')

    freshStore.getState().setPermissions({ role: 'Admin', permissions: ['dict:read'] })
    expect(freshStore.getState().computed.isSuperAdmin).toBe(false)

    freshStore.getState().setIdentity({ username: 'root' })
    expect(freshStore.getState().computed.isSuperAdmin).toBe(true)
  })

  it('未配置 env 超管时，身份不改变判定结果', async () => {
    const { usePermissionStore: freshStore } = await import('./permission-store')
    freshStore.getState().setIdentity({ uid: 42, username: 'someone' })
    freshStore.getState().setPermissions({ role: 'Admin', permissions: [] })
    expect(freshStore.getState().computed.isSuperAdmin).toBe(false)
  })
})
