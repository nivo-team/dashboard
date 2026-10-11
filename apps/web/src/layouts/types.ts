import type { ReactNode } from 'react'

/** 支持的布局变体类型 */
export type LayoutVariant = 'default' | 'desktop' | 'mobile'

export interface BaseLayoutProps {
  children?: ReactNode
}

/** 布局插槽协议：用于拼装页面整体骨架 */
export interface LayoutSlots {
  /** 侧边栏插槽 */
  sidebar?: ReactNode
  /** 浏览器端常规顶栏（Header） */
  header?: ReactNode
  /** 桌面壳专属的整宽固定窗口条（TitleBar） */
  topBar?: ReactNode
  /** AI 面板插槽（浮窗或分屏） */
  ai?: ReactNode
  /** 主内容区域类名 */
  mainClassName?: string
  /** 主内容区插槽 */
  children?: ReactNode
}
