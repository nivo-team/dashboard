/**
 * 全局统一格式化辅助模块。
 * 规范：全站时间展示强制统一使用此模块或 `#/lib/timezone` 提供的格式化函数，
 * 确保各业务页面在切换时区（UTC、各语言对应地区时区）时表现完全一致。
 */

export * from './timezone'

const numberFormatter = new Intl.NumberFormat('zh-CN')

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}
