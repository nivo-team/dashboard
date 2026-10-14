import { describe, expect, it } from 'vite-plus/test'
import { formatTokenCount, formatToolValue } from './format'

/**
 * 会话区格式化的用例。
 *
 * `formatToolValue` 值得测的是**兜底那两条**：入参是 `undefined` 时
 * `JSON.stringify` 返回 `undefined`（不是字符串），循环引用时它**抛异常** ——
 * 这两种情况下都不能让卡片变空白，也不能把会话搞崩。
 */

describe('formatTokenCount', () => {
  it('没有用量时给一个占位破折号', () => {
    expect(formatTokenCount(undefined)).toBe('—')
  })

  it('千 / 百万按 1000 进制缩写，保留一位小数', () => {
    expect(formatTokenCount(999)).toBe('999')
    expect(formatTokenCount(1000)).toBe('1.0K')
    expect(formatTokenCount(1234)).toBe('1.2K')
    expect(formatTokenCount(1_000_000)).toBe('1.0M')
  })

  it('0 是有效值（不是「没有」）', () => {
    expect(formatTokenCount(0)).toBe('0')
  })
})

describe('formatToolValue', () => {
  it('字符串原样：工具返回的"说明句"不该被加引号或转义', () => {
    expect(formatToolValue('已完成')).toBe('已完成')
    expect(formatToolValue('a\nb')).toBe('a\nb')
  })

  it('对象走带缩进的 JSON —— 这是给人排查用的', () => {
    expect(formatToolValue({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('`undefined` 退回朴素表示（JSON.stringify 这时返回的也是 undefined）', () => {
    expect(formatToolValue(undefined)).toBe('undefined')
  })

  it('循环引用不抛错（抛了会把卡片弄成空白、甚至带崩会话）', () => {
    const cyclic: Record<string, unknown> = { name: 'x' }
    cyclic.self = cyclic

    expect(formatToolValue(cyclic)).toBe('[object Object]')
  })

  it('数字 / 布尔 / null 照常', () => {
    expect(formatToolValue(3)).toBe('3')
    expect(formatToolValue(false)).toBe('false')
    expect(formatToolValue(null)).toBe('null')
  })
})
