import { describe, expect, it, vi } from 'vite-plus/test'

/**
 * 部署模式矩阵的回归测试。
 *
 * `app-config` 的值全部来自 `import.meta.env`（构建期静态替换），所以每个用例都要
 * 「重置模块 → 打桩环境变量 → 重新 import」，否则读到的是上一个用例的常量。
 * 这里用一个 helper 把这三步收口，**不要在各用例里手写**。
 */

/** 载入一份「带着指定环境变量」的 app-config 模块。 */
async function loadConfig(env: Record<string, string> = {}) {
  vi.unstubAllEnvs()
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./app-config')
}

describe('应用维度（VITE_MULTI_APP）', () => {
  it('缺省是单应用模式', async () => {
    const config = await loadConfig()
    expect(config.isMultiAppEnabled()).toBe(false)
    expect(config.getDeploymentSnapshot().app).toBe('single')
  })

  it('VITE_MULTI_APP=true 开启多应用', async () => {
    const config = await loadConfig({ VITE_MULTI_APP: 'true' })
    expect(config.isMultiAppEnabled()).toBe(true)
    expect(config.getDeploymentSnapshot().app).toBe('multi')
  })

  it('只认 true / 1，其余（含拼错的）一律回落单应用', async () => {
    expect((await loadConfig({ VITE_MULTI_APP: '1' })).isMultiAppEnabled()).toBe(true)
    expect((await loadConfig({ VITE_MULTI_APP: 'yes' })).isMultiAppEnabled()).toBe(false)
    expect((await loadConfig({ VITE_MULTI_APP: '' })).isMultiAppEnabled()).toBe(false)
  })

  it('默认应用 id / 名称可被环境变量覆盖，空串回落缺省值', async () => {
    expect((await loadConfig()).DEFAULT_APP_ID).toBe('nivo')
    expect((await loadConfig({ VITE_DEFAULT_APP_ID: 'portal' })).DEFAULT_APP_ID).toBe('portal')
    expect((await loadConfig({ VITE_DEFAULT_APP_ID: '   ' })).DEFAULT_APP_ID).toBe('nivo')

    const custom = await loadConfig({ VITE_DEFAULT_APP_NAME: '内部后台' })
    expect(custom.DEFAULT_APP_NAME).toBe('内部后台')
  })
})

describe('进入应用选择的策略（VITE_APP_SELECT_MODE）', () => {
  it('单应用模式恒为 false —— 那一层由 beforeLoad 直接重定向', async () => {
    const config = await loadConfig({ VITE_APP_SELECT_MODE: 'always' })
    expect(config.shouldEnterAppSelect()).toBe(false)
    expect(config.shouldEnterAppSelect(5)).toBe(false)
  })

  it('auto（缺省）：应用数 > 1 才进；未知时按「进」处理', async () => {
    const config = await loadConfig({ VITE_MULTI_APP: 'true' })
    expect(config.getAppSelectMode()).toBe('auto')
    expect(config.shouldEnterAppSelect()).toBe(true)
    expect(config.shouldEnterAppSelect(0)).toBe(false)
    expect(config.shouldEnterAppSelect(1)).toBe(false)
    expect(config.shouldEnterAppSelect(2)).toBe(true)
  })

  it('always：哪怕只有一个应用也进选择页', async () => {
    const config = await loadConfig({ VITE_MULTI_APP: 'true', VITE_APP_SELECT_MODE: 'always' })
    expect(config.shouldEnterAppSelect(1)).toBe(true)
    expect(config.shouldEnterAppSelect(0)).toBe(true)
  })

  it('never：从不进选择页', async () => {
    const config = await loadConfig({ VITE_MULTI_APP: 'true', VITE_APP_SELECT_MODE: 'never' })
    expect(config.shouldEnterAppSelect(9)).toBe(false)
    expect(config.shouldEnterAppSelect()).toBe(false)
  })

  it('无法识别的取值回落 auto', async () => {
    const config = await loadConfig({ VITE_MULTI_APP: 'true', VITE_APP_SELECT_MODE: 'AUTO' })
    expect(config.getAppSelectMode()).toBe('auto')
  })
})

describe('账号维度（VITE_MULTI_ACCOUNT）', () => {
  it('缺省是多账号：开放注册与找回', async () => {
    const config = await loadConfig()
    expect(config.isMultiAccountEnabled()).toBe(true)
    expect(config.getAuthUiOptions()).toMatchObject({
      showRegisterLink: true,
      showForgotLinks: true,
    })
  })

  it('单账号：登录页不引导注册与找回', async () => {
    const config = await loadConfig({ VITE_MULTI_ACCOUNT: 'false' })
    expect(config.isMultiAccountEnabled()).toBe(false)
    expect(config.getAuthUiOptions()).toMatchObject({
      showRegisterLink: false,
      showForgotLinks: false,
    })
    expect(config.getDeploymentSnapshot().account).toBe('single')
  })

  it('测试账号下拉缺省跟随 DEV；显式开启后即便构建产物也展示', async () => {
    // 「跟随 DEV」是契约本身：断言它与 `import.meta.env.DEV` 一致，而不是写死 true/false
    // （开发服务器下为 true、构建产物里为 false，两边都不该由测试来钉死）
    expect((await loadConfig()).getAuthUiOptions().showDemoAccounts).toBe(import.meta.env.DEV)
    expect(
      (await loadConfig({ VITE_SHOW_DEMO_ACCOUNTS: 'true' })).getAuthUiOptions().showDemoAccounts,
    ).toBe(true)
    expect(
      (await loadConfig({ VITE_SHOW_DEMO_ACCOUNTS: 'false' })).getAuthUiOptions().showDemoAccounts,
    ).toBe(false)
  })
})

describe('最高管理员（VITE_SUPER_ADMIN_ID）', () => {
  it('未配置时任何人都不命中', async () => {
    const config = await loadConfig()
    expect(config.CONFIGURED_SUPER_ADMIN).toBe('')
    expect(config.isConfiguredSuperAdmin({ uid: 1, username: 'super admin' })).toBe(false)
    expect(config.isConfiguredSuperAdmin(null)).toBe(false)
  })

  it('按 uid 命中，数字与字符串写法等价', async () => {
    const config = await loadConfig({ VITE_SUPER_ADMIN_ID: '42' })
    expect(config.isConfiguredSuperAdmin({ uid: 42 })).toBe(true)
    expect(config.isConfiguredSuperAdmin({ uid: '42' })).toBe(true)
    expect(config.isConfiguredSuperAdmin({ uid: 43 })).toBe(false)
  })

  it('按登录名命中，忽略大小写与首尾空格', async () => {
    const config = await loadConfig({ VITE_SUPER_ADMIN_ID: 'Super Admin' })
    expect(config.isConfiguredSuperAdmin({ username: 'super admin' })).toBe(true)
    expect(config.isConfiguredSuperAdmin({ username: 'SUPER ADMIN' })).toBe(true)
    expect(config.isConfiguredSuperAdmin({ username: 'admin' })).toBe(false)
  })

  it('id 与登录名是「任一命中」，且快照带上原值', async () => {
    const config = await loadConfig({ VITE_SUPER_ADMIN_ID: '42' })
    expect(config.isConfiguredSuperAdmin({ uid: 7, username: '42' })).toBe(true)
    expect(config.getDeploymentSnapshot().superAdminId).toBe('42')
  })
})

describe('部署快照', () => {
  it('四个维度一次性读出来（关于页与排查用）', async () => {
    const config = await loadConfig({
      VITE_MULTI_APP: 'true',
      VITE_MULTI_ACCOUNT: 'false',
      VITE_APP_SELECT_MODE: 'always',
      VITE_SUPER_ADMIN_ID: 'root',
    })
    expect(config.getDeploymentSnapshot()).toEqual({
      app: 'multi',
      account: 'single',
      appSelect: 'always',
      superAdminId: 'root',
    })
  })
})
