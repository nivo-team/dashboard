/**
 * 把 `unknown` 转成可显示文本 —— 统一收口「怎么把一个来路不明的值变成字符串」。
 *
 * 为什么不直接 `String(value)`：`value: unknown` 时 TS 无法排除对象，`String(obj)` 会静默
 * 得到 `[object Object]`（oxlint `no-base-to-string`）。这里显式分流：
 *
 * - `null` / `undefined` → `''`（占位符由调用方决定，例如 `text || '-'`）
 * - 标量（string / number / boolean / bigint）→ `String()`
 * - 其它（对象 / 数组）→ `JSON.stringify()`，宁可显示 JSON 也不要 `[object Object]`
 *
 * 注意：契约上**必须是字符串**的地方（JSON Schema 入参、`FileReader.result`）不要用它，
 * 那里应当用 `typeof x === 'string'` 明确收窄。
 */
export function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}
