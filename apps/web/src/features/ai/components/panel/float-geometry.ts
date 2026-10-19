import { AI_FLOAT_MIN_WIDTH } from '#/lib/store'
import { AI_PANEL_HEADER_HEIGHT } from './constants'

/**
 * 浮窗（Float）的几何推导 —— **纯函数**，三种形态判定与两个终点尺寸都在这里。
 *
 * 为什么值得单独一个文件：这几条规则彼此牵制、又都是「写错了一眼看不出来」的那种 ——
 * 折叠只在桌面端成立、变形期间**不能**切成折叠态内容（否则动画没有内容可收缩）、
 * 折叠的终点是「最小宽度 × 头行高度」。散在 1128 行的组件里时，谁都说不清
 * 「移动端点折叠会怎样」。
 */
export interface FloatGeometryInput {
  /** 外壳给的受控折叠态（`AiPanelProps.collapsed`） */
  collapsed: boolean
  /** 移动端视口（或移动原生壳） */
  isMobile: boolean
  /** 目标刚变过：折叠态与上一帧不同（见 `AiPanel` 的 `floatDeforming`） */
  deforming: boolean
  /** 能不能播动画（设置 → 外观「界面动效」且系统没要求减少动效） */
  motionEnabled: boolean
  /** 存档 / 拖拽出来的那一档尺寸 */
  size: { width: number; height: number }
}

export interface FloatGeometry {
  /**
   * 折叠**只在桌面端成立**：移动端浮窗是整屏（`inset-0` 会把没有高度的盒子照样撑满），
   * 「只留一条」在那儿既画不出来也没意义。状态本身保留着，窗口变宽回来仍是折叠的。
   */
  isCollapsed: boolean
  /** 「展开 ↔ 折叠」的变形是否正在进行（三个条件缺一不可，见 `resolveFloatGeometry`）。 */
  isDeforming: boolean
  /**
   * 头行 / 动作区按哪个形态渲染。
   *
   * **变形结束才算折叠**：变形期间保持展开态的内容（会话选择器 + 四颗按钮），
   * 让它们随着外框一起被裁掉；一变就直接换成窄条头行的话，动画就没有内容可收缩了。
   */
  surfaceCollapsed: boolean
  /** 变形的终点尺寸：折叠 = 一条头行；展开 = 存档 / 拖拽出来的那一档 */
  targetWidth: number
  targetHeight: number
}

export function resolveFloatGeometry(input: FloatGeometryInput): FloatGeometry {
  // 三个条件缺一不可：桌面端（移动端没有可变的宽高）、目标刚变过、能播动画
  // （关掉「界面动效」或系统要求减少动效时直接切，不留那 220ms 的过渡窗口）。
  const isDeforming = !input.isMobile && input.deforming && input.motionEnabled
  const isCollapsed = !input.isMobile && input.collapsed

  return {
    isCollapsed,
    isDeforming,
    surfaceCollapsed: isCollapsed && !isDeforming,
    targetWidth: isCollapsed ? AI_FLOAT_MIN_WIDTH : input.size.width,
    targetHeight: isCollapsed ? AI_PANEL_HEADER_HEIGHT : input.size.height,
  }
}
