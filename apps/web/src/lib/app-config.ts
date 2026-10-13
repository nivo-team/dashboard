import { getBrandConfig } from './brand'

/**
 * 部署模式配置中心（**本前端怎么部署**的唯一真值）。
 *
 * ## 两个正交维度
 *
 * | 维度 | 环境变量 | `single` | `multi` |
 * |---|---|---|---|
 * | **应用** | `VITE_MULTI_APP` | 只有一个应用，URL 直接落在 `/$DEFAULT_APP_ID/…` | 有多个应用，URL 是 `/$appId/…`，可切换 |
 * | **账号** | `VITE_MULTI_ACCOUNT` | 只有一个账号：不开放注册，登录页也不引导注册 | 多账号：开放注册与找回 |
 *
 * 组合出四种部署形态，代码里**不写 `if (模式 === 'xx')`**，而是各自读一个能力函数
 * （`isMultiAppEnabled()` / `isMultiAccountEnabled()` / `shouldEnterAppSelect()`），
 * 这样以后加维度不用改调用点。
 *
 * ## 三条铁律
 *
 * 1. 这些值**只在构建期确定**（`import.meta.env` 是静态替换），所以它们是纯函数、
 *    不带状态、可在模块初始化时求值；
 * 2. 需要响应式读取时用 `useDeployment()`（见文件末尾），它把它们包成 hook；
 * 3. **前端判断只是「显示与引导」，不是安全边界** —— 接口权限一律假设后端有硬校验
 *    （见 `apps/mock/README.md` 的角色说明，与
 *    `.agents/skills/business-development/references/permissions-architecture.md`）。
 */

/* -------------------------------------------------------------------------- */
/*                                  读取工具                                    */
/* -------------------------------------------------------------------------- */

/** 宽松布尔解析：`true` / `1` 为真，`false` / `0` 为假，其余回落 `fallback`。 */
function readBool(value: unknown, fallback: boolean): boolean {
  if (value === 'true' || value === '1' || value === true) return true
  if (value === 'false' || value === '0' || value === false) return false
  return fallback
}

/** 非空字符串，否则回落缺省值。 */
function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/* -------------------------------------------------------------------------- */
/*                                 应用维度                                     */
/* -------------------------------------------------------------------------- */

/** 是否开启多应用模式（默认关闭，即单应用模式）。 */
export function isMultiAppEnabled(): boolean {
  return readBool(import.meta.env.VITE_MULTI_APP, false)
}

/** 单应用模式下的默认应用 ID（路由前缀与存储作用域）。 */
export const DEFAULT_APP_ID: string = readString(import.meta.env.VITE_DEFAULT_APP_ID, 'nivo')

/** 单应用模式下的默认应用显示名称（默认回退至系统品牌简称）。 */
export const DEFAULT_APP_NAME: string = readString(
  import.meta.env.VITE_DEFAULT_APP_NAME,
  getBrandConfig().shortName,
)

/*
  取「当前账号可用应用」的路径**不是环境变量**：它由契约固定为 `GET /apps`
  （`fetchAvailableApps()` 走生成好的 `getApps()`，见 `#/lib/auth`）。
  早期版本留过一个 `VITE_APPS_API_PATH`，但没有任何代码读它 —— 一个点了没反应的旋钮
  比没有旋钮更糟，所以删掉了。真要换地址，那是 `apiBaseUrl` / 后端网关的事。
*/

/* -------------------------------------------------------------------------- */
/*                               进入应用选择的策略                              */
/* -------------------------------------------------------------------------- */

/**
 * 是否进入 `/` 的应用选择页：
 * - `auto`（默认）：多应用模式下，**应用数 > 1 才进选择页**；只有一个应用时直接进去；
 * - `always`：多应用模式总是进选择页（哪怕只有一个应用，用户也看一眼再点进去）；
 * - `never`：永远不走选择页（只有一个应用时才合理）。
 */
export type AppSelectMode = 'auto' | 'always' | 'never'

export function getAppSelectMode(): AppSelectMode {
  const raw = readString(import.meta.env.VITE_APP_SELECT_MODE, 'auto')
  return raw === 'always' || raw === 'never' ? raw : 'auto'
}

/**
 * 给定可选应用数量，判断是否该把用户送到应用选择页（`/`）。
 *
 * 单应用模式恒为 false —— 那一层由 `beforeLoad` 直接重定向到默认应用。
 * `appCount` 未知（还没拉到列表）时传 `undefined`：`auto` 下按「进选择页」处理，
 * 避免应用列表就绪前把用户误送进某个应用。
 */
export function shouldEnterAppSelect(appCount?: number): boolean {
  if (!isMultiAppEnabled()) return false
  switch (getAppSelectMode()) {
    case 'never':
      return false
    case 'always':
      return true
    default:
      return appCount === undefined ? true : appCount > 1
  }
}

/* -------------------------------------------------------------------------- */
/*                                 账号维度                                     */
/* -------------------------------------------------------------------------- */

/**
 * 是否开启多账号（默认开启）。
 *
 * 单账号模式：这是「一套部署只服务一个账号」的形态（自托管 / 专用后台）——
 * 不开放注册，登录页也不引导注册；账号本身仍由后端校验。
 */
export function isMultiAccountEnabled(): boolean {
  return readBool(import.meta.env.VITE_MULTI_ACCOUNT, true)
}

/* -------------------------------------------------------------------------- */
/*                                最高管理员                                    */
/* -------------------------------------------------------------------------- */

/**
 * 由环境变量指定的**最高管理员**（用户 id 或登录名）。
 *
 * 有些部署里后端并不下发 `Super Admin` 这种角色名，而是约定「某个账号就是最高管理员」。
 * 配了它之后，该身份的登录态一律按超管处理（见 `store/permission-store` 的
 * `computePermissions`），**不需要**后端返回通配权限点。
 *
 * 留空 = 不启用（只认后端下发的角色名 / 通配权限点）。
 */
export const CONFIGURED_SUPER_ADMIN: string = readString(import.meta.env.VITE_SUPER_ADMIN_ID, '')

/** 该身份是否就是 env 里配置的最高管理员（按 uid 或登录名匹配，忽略大小写）。 */
export function isConfiguredSuperAdmin(
  identity?: { uid?: number | string | null; username?: string | null } | null,
): boolean {
  if (!CONFIGURED_SUPER_ADMIN || !identity) return false
  const target = CONFIGURED_SUPER_ADMIN.toLowerCase()
  if (identity.uid !== undefined && identity.uid !== null) {
    if (String(identity.uid).toLowerCase() === target) return true
  }
  return typeof identity.username === 'string' && identity.username.trim().toLowerCase() === target
}

/* -------------------------------------------------------------------------- */
/*                              登录页的呈现选项                                 */
/* -------------------------------------------------------------------------- */

/**
 * 登录页/注册页按部署模式推导出的可选项 —— 路由只负责把它们透传给
 * `#/features/auth` 的组件，**不在路由里再判断一次模式**。
 */
export interface AuthUiOptions {
  /** 是否展示快捷测试账号选择框（默认只在开发环境展示）。 */
  showDemoAccounts: boolean
  /** 是否展示「立即注册」引导（单账号模式关闭）。 */
  showRegisterLink: boolean
  /** 是否展示「忘记邮箱 / 密码」引导（单账号模式关闭）。 */
  showForgotLinks: boolean
  /** 是否展示第三方登录按钮（仍需至少配置一个 provider，见 oauth-config）。 */
  showOAuth: boolean
}

export function getAuthUiOptions(): AuthUiOptions {
  const multiAccount = isMultiAccountEnabled()
  return {
    // 测试账号只在开发环境出现；生产想临时打开可显式设 VITE_SHOW_DEMO_ACCOUNTS=true
    showDemoAccounts: readBool(import.meta.env.VITE_SHOW_DEMO_ACCOUNTS, import.meta.env.DEV),
    showRegisterLink: multiAccount,
    showForgotLinks: multiAccount,
    // OAuth 是否真的渲染，还要看有没有开启的 provider（`useOAuthProviders` 兜底）
    showOAuth: true,
  }
}

/* -------------------------------------------------------------------------- */
/*                                 模式快照                                     */
/* -------------------------------------------------------------------------- */

export interface DeploymentSnapshot {
  app: 'single' | 'multi'
  account: 'single' | 'multi'
  appSelect: AppSelectMode
  superAdminId: string
}

/** 当前部署模式的快照（日志、关于页、调试用）。 */
export function getDeploymentSnapshot(): DeploymentSnapshot {
  return {
    app: isMultiAppEnabled() ? 'multi' : 'single',
    account: isMultiAccountEnabled() ? 'multi' : 'single',
    appSelect: getAppSelectMode(),
    superAdminId: CONFIGURED_SUPER_ADMIN,
  }
}
