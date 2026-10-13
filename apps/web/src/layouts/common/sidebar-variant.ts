import type { LayoutVariant } from '../types'

/**
 * 侧边栏的**平台变体**划分 —— 全站唯一一份。
 *
 * 业务侧边栏（`./app-sidebar`）与外壳侧边栏（`./main-sidebar`）用的是**同一套**
 * 变体划分：内容不同，平台差异完全一致（顶栏形态、折叠按钮、抽屉开合、
 * 折叠态文案）。所以「外壳布局 → 变体」的映射表也必须是同一份 ——
 * 各写一份的话，将来加平台必然漏掉一个侧边栏。
 */
export type SidebarVariant = 'web' | 'mobile' | 'desktop'

/** 外壳布局 → 侧边栏变体。加平台时这里加一行，两个侧边栏的变体表各加一行。 */
export const SIDEBAR_BY_LAYOUT: Record<LayoutVariant, SidebarVariant> = {
  default: 'web',
  mobile: 'mobile',
  desktop: 'desktop',
}
