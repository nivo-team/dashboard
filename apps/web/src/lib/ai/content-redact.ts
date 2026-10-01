/**
 * 敏感值脱敏 —— **AI 侧唯一一处脱敏出口**。
 *
 * ## 为什么必须收在一处
 *
 * 「敏感字段的原文不进模型上下文」这条边界如果散在各工具里，迟早会有一处漏掉 ——
 * 而漏掉的后果不可撤销：值已经进了对话（以及随后的模型请求）。所以规则写死在这里，
 * 调用点只负责"按字段注解决定哪些字段要过它"。
 *
 * ## 规则（与 `ai-tools-implementation-spec.md` §1.2 的表格一一对应）
 *
 * | 值 | 脱敏后 |
 * |---|---|
 * | `13812341234` | `138****1234` |
 * | `a@example.com` | `a***@example.com`（本地部分只留首字符） |
 * | `110101199001011234` | `110101********1234` |
 * | 长度 ≤ 4 或非字符串 | `****` |
 *
 * 通用规则是**保留首尾、中间整段打码**：星号数就是中间那段的长度，不做固定长度填充 ——
 * 让"看到几个星号"本身不附带额外信息。长度 > 12 的值（身份证这类）首部多留 3 位：
 * 它们的前缀本身有含义（地区码 6 位），多留几位便于人核对，同时仍不暴露后半段。
 */

/**
 * 邮箱：本地部分只留首字符，其余打码，域名原样。
 *
 * 邮箱不能套"保留首尾"的通用规则 —— 那样会露出域名之外还会露出本地部分尾字符，
 * 而这个字段恰恰是"想知道是不是某个人"时最先被拿来比对的东西。
 */
const EMAIL_PATTERN = /^([^@\s]+)@([^@\s]+)$/

/** 超过这个长度的值按"长值"处理，首部保留更多位。 */
const LONG_VALUE_THRESHOLD = 12
const LONG_HEAD = 6
const DEFAULT_HEAD = 3
const DEFAULT_TAIL = 4

/** 短值 / 非字符串的统一占位。 */
const FULLY_MASKED = '****'

/**
 * 脱敏规则：保留首尾、中间打码。短值（≤ 4 位）整体打码。
 *
 * 非字符串（数字 / 布尔 / null / 对象…）一律整体打码：宁可多脱一点，
 * 也不为"数字类型的手机号"另开一条会漏的路径。
 */
export function maskValue(value: unknown): unknown {
  if (typeof value !== 'string') return FULLY_MASKED

  const text = value
  if (text.length <= 4) return FULLY_MASKED

  const email = EMAIL_PATTERN.exec(text)
  if (email) {
    return `${email[1].slice(0, 1)}***@${email[2]}`
  }

  const head = text.length > LONG_VALUE_THRESHOLD ? LONG_HEAD : DEFAULT_HEAD

  /*
    短值（5 ~ 8 位）下"首 3 尾 4"会互相重叠，这里把保留位收缩到至少留 1 个星号 ——
    否则输出的星号数会算成 0 或负数，等于没脱。
  */
  const safeHead = Math.max(1, Math.min(head, text.length - 5))
  const safeTail = Math.max(1, Math.min(DEFAULT_TAIL, text.length - safeHead - 1))
  const stars = '*'.repeat(text.length - safeHead - safeTail)

  return `${text.slice(0, safeHead)}${stars}${text.slice(-safeTail)}`
}

/**
 * 按字段注解脱敏一条记录：`sensitive: true` 的字段走 `maskValue`，其余原样。
 * 未声明的字段**原样保留**（它是页面自己要用的数据；AI 侧另有"未注解字段不可用"的约定）。
 *
 * 返回**新对象**：脱敏是给 AI 看的一次投影，绝不能就地改写页面自己持有的行数据。
 */
export function redactRecord(
  record: Record<string, unknown>,
  fields: readonly { name: string; sensitive?: boolean }[],
): Record<string, unknown> {
  const sensitiveNames = new Set<string>()
  for (const field of fields) {
    if (field.sensitive) sensitiveNames.add(field.name)
  }

  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    redacted[key] = sensitiveNames.has(key) ? maskValue(value) : value
  }
  return redacted
}

/** 批量（数组）版本；非数组输入原样返回。 */
export function redactRecords(
  value: unknown,
  fields: readonly { name: string; sensitive?: boolean }[],
): unknown {
  if (!Array.isArray(value)) return value
  return value.map((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? redactRecord(item as Record<string, unknown>, fields)
      : item,
  )
}
