/**
 * 会话区空态的**问候语**：按时段挑一句。
 *
 * 用**用户选的时区**（设置 → 外观 → 时区）而不是碰巧的本机时区：这个后台里
 * 「现在几点」处处以那个设置为准（时间列、相对时间），问候语没理由例外 ——
 * 否则用户把时区设成纽约、人坐在北京，会话区说「晚上好」而列表里全是上午的时间。
 */
export const GREETING_FALLBACK = {
  morning: '早上好。',
  afternoon: '下午好。',
  evening: '晚上好。',
} as const

export type GreetingKey = keyof typeof GREETING_FALLBACK

/**
 * 按时段选问候语。
 *
 * `hourCycle: 'h23'` 是必须的：`hour12: false` 在午夜会给出 "24" 而不是 "0"。
 *
 * `now` 只为**用例**留的注入点（默认取此刻）—— 判定本身是纯的，别把时钟读进函数体里。
 */
export function greetingKeyOf(iana: string, now: Date = new Date()): GreetingKey {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  )

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}
