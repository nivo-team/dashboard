import { CloudIcon } from '@phosphor-icons/react'
import type { ComponentType } from 'react'

/**
 * 系统全局品牌配置规范
 *
 * 铁律与限制规则：
 * 1. 【唯一真值原则】：品牌名称与标识只由本模块统一定义与解析，禁止在业务组件、
 *    外壳导航或页面中直接读取环境变量（如 `import.meta.env.VITE_APP_*`）或硬编码字符串。
 * 2. 【受控访问限制】：所有品牌信息的读取必须且只能通过指定函数 `getBrandConfig()`
 *    或 React Hook `useBrand()` 获取。
 * 3. 【不可变保护】：配置对象由 `Object.freeze` 深度冻结，禁止在运行期修改。
 */
export interface BrandConfig {
  /** 应用品牌完整名称（用于网页标题、登录页展示、关于页等） */
  readonly name: string
  /** 应用品牌简称（用于侧边栏头部、徽标旁短标题等空间紧凑区域） */
  readonly shortName: string
  /** 品牌简介或标语描述 */
  readonly description: string
  /** 品牌默认图标组件 */
  readonly logoIcon: ComponentType<{ size?: number; className?: string }>
}

/** 默认兜底品牌配置 */
const DEFAULT_BRAND_FALLBACK = {
  name: 'Nivo Admin',
  shortName: 'Admin',
  description: '多应用工作空间的后端管理台',
} as const

/**
 * 内部解析并冻结的品牌单例对象（私有，不直接对外导出）。
 * 强制所有调用方通过 `getBrandConfig()` 获取。
 */
let frozenBrandInstance: Readonly<BrandConfig> | null = null

function resolveBrandConfig(): Readonly<BrandConfig> {
  const envName = import.meta.env.VITE_APP_NAME?.trim()
  const envShortName = import.meta.env.VITE_APP_SHORT_NAME?.trim()
  const envDescription = import.meta.env.VITE_APP_DESCRIPTION?.trim()

  const name = envName || DEFAULT_BRAND_FALLBACK.name
  const shortName =
    envShortName || (envName ? envName.slice(0, 10) : DEFAULT_BRAND_FALLBACK.shortName)
  const description = envDescription || DEFAULT_BRAND_FALLBACK.description

  const config: BrandConfig = {
    name,
    shortName,
    description,
    logoIcon: CloudIcon,
  }

  return Object.freeze(config)
}

/**
 * 获取全局系统品牌配置的唯一受控入口函数。
 *
 * @returns 深度冻结且只读的品牌配置对象
 *
 * @example
 * ```ts
 * const brand = getBrandConfig()
 * console.log(brand.name, brand.shortName)
 * ```
 */
export function getBrandConfig(): Readonly<BrandConfig> {
  if (!frozenBrandInstance) {
    frozenBrandInstance = resolveBrandConfig()
  }
  return frozenBrandInstance
}

/**
 * React 组件中获取系统品牌配置的受控 Hook。
 * 底层基于指定函数 `getBrandConfig()`。
 */
export function useBrand(): Readonly<BrandConfig> {
  return getBrandConfig()
}
