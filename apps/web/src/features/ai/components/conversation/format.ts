/**
 * 会话区里两处「把值变成能读的文本」的格式化。
 *
 * 放在一起是因为它们其实是**同一条规则**（漂亮 JSON，失败退回朴素表示），
 * 从前分在两个函数里、一处用 `?? String(value)` 一处用 `typeof text === 'string'`
 * 来兜同一个底 —— 现在只有一份实现，两种失败（`undefined` 入参、循环引用）都有用例钉住。
 */

/** token 数的紧凑写法（1234 → 1.2K）—— 只用于那一行元信息，不追求精确。 */
export function formatTokenCount(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

/**
 * 把工具的参数 / 结果 / 审批入参格式化成**能读的文本**。
 *
 * 对象走带缩进的 `JSON.stringify` —— 这是给人排查用的，缩进比紧凑有用得多；
 * 字符串原样（工具返回的那些"说明句"不该被加上引号与转义）；其余交给 `String()`。
 * 循环引用之类会让 `JSON.stringify` 抛 / 返回 `undefined`，那就退回最朴素的表示，
 * **绝不因为格式化失败而把卡片弄成空白**。
 */
export function formatToolValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
