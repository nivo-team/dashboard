import type { Icon, IconWeight } from '@phosphor-icons/react'
import { ChartLineIcon, MonitorIcon, SquaresFourIcon } from '@phosphor-icons/react'

/**
 * 应用注册表：把「服务端下发的应用」与「前端呈现资源」拼起来。
 *
 * 应用的**列表与地址**由接口 `GET /apps` 下发（见 `apps/mock`），本文件只负责
 * 前端独有的那部分 —— 图标是 Phosphor 组件、无法走 JSON，因此按 `id` 映射。
 *
 * 加一个新应用时：后端/契约里加一条记录，这里补一个图标映射即可；
 * 没有映射的 id 会退回到默认图标，不会因为漏配而渲染不出来。
 */

export interface UserInfo {
  username: string
  name: string
  email?: string
  avatar?: string
  role?: string
  uid?: number
}

/** 一个可选应用（含前端呈现资源）。 */
export interface AppItem {
  id: string
  name: string
  headline: string
  description: string
  /** 展示用域名（不带协议） */
  domain: string
  /** 该应用的接口根地址；未提供时沿用当前客户端的 baseUrl */
  apiBaseUrl?: string
  badge?: string
  category?: string
  themeGradient: string
  /** 图标：前端呈现资源，由 `APP_ICONS` 按 id 映射 */
  icon: Icon
  /**
   * 图标呈现权重（Phosphor 的 thin / light / regular / bold / fill / duotone），缺省 `regular`。
   * 与 `icon` 一样属于前端呈现资源，不写入本地认证存档。
   */
  iconWeight?: IconWeight
}

/** 接口下发的应用（不含图标等前端资源）。 */
export type AppPayload = Omit<AppItem, 'icon' | 'iconWeight'>

/** 拿不到当前应用时的兜底 id。 */
export const DEFAULT_APP_ID = 'app1'

/** 应用 id → 图标。 */
export const APP_ICONS: Record<string, Icon> = {
  app1: MonitorIcon,
  app2: ChartLineIcon,
}

const FALLBACK_ICON = SquaresFourIcon

const FALLBACK_GRADIENT = 'from-[#0b3323] via-[#0d3f2c] to-[#08261b]'

/** 给接口下发的应用补上前端呈现资源。 */
export function toAppItems(payloads: AppPayload[]): AppItem[] {
  return payloads.map((payload) => ({
    ...payload,
    icon: APP_ICONS[payload.id] ?? FALLBACK_ICON,
    themeGradient: payload.themeGradient || FALLBACK_GRADIENT,
  }))
}

/** 存档恢复时用：按 id 取回图标（存档里不存图标）。 */
export function iconForAppId(id: string): Icon {
  return APP_ICONS[id] ?? FALLBACK_ICON
}
