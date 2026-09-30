/**
 * 应用模式与多应用/单应用统一配置中心。
 *
 * 核心设计：
 * - 单应用模式（默认）：
 *   - 不需要后端提供 GET /apps 接口；
 *   - 访问根路径 / 或登录成功后直接直达默认应用（如 /nivo/home）；
 *   - 保持现有的 IndexedDB 和 localStorage（scoped-storage）架构完全不变；
 *   - 外壳自动隐藏「应用选择」与「切换应用」下拉，界面更干净流畅。
 * - 多应用模式：
 *   - 只需配置环境变量 VITE_MULTI_APP=true（或 1），并配置 /apps 接口；
 *   - 自动开启工作空间选择页 / 与侧边栏应用切换器，支持多应用数据隔离。
 */

/** 是否开启多应用模式（默认关闭，即单应用模式）。 */
export function isMultiAppEnabled(): boolean {
  const envVal = import.meta.env.VITE_MULTI_APP
  return envVal === 'true' || envVal === '1'
}

/** 单应用模式下的默认应用 ID（路由前缀与存储作用域）。 */
export const DEFAULT_APP_ID: string =
  (import.meta.env.VITE_DEFAULT_APP_ID as string | undefined) || 'nivo'

/** 单应用模式下的默认应用显示名称。 */
export const DEFAULT_APP_NAME: string =
  (import.meta.env.VITE_DEFAULT_APP_NAME as string | undefined) || 'Admin'

/** 多应用模式下获取应用列表的 API 路径。 */
export const APPS_API_PATH: string =
  (import.meta.env.VITE_APPS_API_PATH as string | undefined) || '/apps'
