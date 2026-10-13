import { describe, expect, it } from 'vite-plus/test'
import { AI_FLOAT_MIN_WIDTH } from '#/lib/store'
import { AI_PANEL_HEADER_HEIGHT } from './constants'
import { resolveFloatGeometry, type FloatGeometryInput } from './float-geometry'

/**
 * 浮窗几何推导的用例。
 *
 * 三条规则都是「改一个字就会静默坏掉」的类型，正是抽成纯函数的原因：
 *
 * 1. **折叠只在桌面端成立** —— 移动端浮窗是整屏，折叠态既画不出来也没意义；
 * 2. **变形期间不算折叠** —— 一变就把内容换成窄条头行的话，动画就没有内容可收缩了
 *    （表现是「折叠动画一闪而过」而不是「内容被裁掉」）；
 * 3. **变形需要能播动画** —— 关掉「界面动效」时不留那 220ms 的过渡窗口，直接切到位。
 */

const base: FloatGeometryInput = {
  collapsed: false,
  isMobile: false,
  deforming: false,
  motionEnabled: true,
  size: { width: 420, height: 560 },
}

const resolve = (over: Partial<FloatGeometryInput> = {}) =>
  resolveFloatGeometry({ ...base, ...over })

describe('resolveFloatGeometry', () => {
  it('展开态：终点就是存档的那一档尺寸', () => {
    expect(resolve()).toEqual({
      isCollapsed: false,
      isDeforming: false,
      surfaceCollapsed: false,
      targetWidth: 420,
      targetHeight: 560,
    })
  })

  it('折叠态（已停稳）：一条头行 —— 最小宽度 × 头行高度', () => {
    expect(resolve({ collapsed: true })).toEqual({
      isCollapsed: true,
      isDeforming: false,
      surfaceCollapsed: true,
      targetWidth: AI_FLOAT_MIN_WIDTH,
      targetHeight: AI_PANEL_HEADER_HEIGHT,
    })
  })

  it('折叠变形期间：目标已经是窄条，但内容仍是展开态', () => {
    const geometry = resolve({ collapsed: true, deforming: true })

    expect(geometry.isDeforming).toBe(true)
    expect(geometry.surfaceCollapsed).toBe(false)
    // 终点尺寸不受「内容还没切」影响 —— 外框该收就得收
    expect(geometry.targetWidth).toBe(AI_FLOAT_MIN_WIDTH)
    expect(geometry.targetHeight).toBe(AI_PANEL_HEADER_HEIGHT)
  })

  it('展开变形期间：内容保持展开态，终点是存档尺寸', () => {
    const geometry = resolve({ collapsed: false, deforming: true })

    expect(geometry.isDeforming).toBe(true)
    expect(geometry.surfaceCollapsed).toBe(false)
    expect(geometry.targetWidth).toBe(420)
  })

  it('移动端：折叠整条不成立（状态照旧，只是不生效）', () => {
    const geometry = resolve({ collapsed: true, isMobile: true })

    expect(geometry.isCollapsed).toBe(false)
    expect(geometry.surfaceCollapsed).toBe(false)
    expect(geometry.targetWidth).toBe(420)
  })

  it('移动端即便刚变过折叠态也不算变形（没有可动的宽高）', () => {
    expect(resolve({ collapsed: true, isMobile: true, deforming: true }).isDeforming).toBe(false)
  })

  it('关掉「界面动效」：直接切到位，不留过渡窗口', () => {
    const geometry = resolve({ collapsed: true, deforming: true, motionEnabled: false })

    expect(geometry.isDeforming).toBe(false)
    // 没有变形 → 直接就是折叠态的内容
    expect(geometry.surfaceCollapsed).toBe(true)
    expect(geometry.targetHeight).toBe(AI_PANEL_HEADER_HEIGHT)
  })

  it('尺寸随存档变：拖动后展开回到新的那一档', () => {
    expect(resolve({ size: { width: 600, height: 300 } }).targetWidth).toBe(600)
    expect(resolve({ size: { width: 600, height: 300 } }).targetHeight).toBe(300)
  })
})
