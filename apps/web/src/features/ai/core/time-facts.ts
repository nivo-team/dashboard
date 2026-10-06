import i18n from '#/lib/i18n'
import {
  formatDateTime,
  getTimezone,
  getTimezoneMeta,
  getTimezoneOffsetLabel,
} from '#/lib/timezone'
import type { AiTimeFacts } from './types'

/**
 * **浏览器侧的时间事实采集** —— 见 `AiTimeFacts`（`./types`）里"为什么必须由浏览器给"。
 *
 * 只用浏览器原生能力 + 全站既有的时区工具（`#/lib/timezone`），不引任何日期库：
 * - 绝对时刻：`Date` / `toISOString`；
 * - 展示时区下的本地时间：`formatDateTime`（全站时间格式化的**唯一出口**，与时区偏好同源）；
 * - 星期几：`Intl.DateTimeFormat` 的 `weekday`，已按展示时区与界面语言本地化。
 *
 * 每次调用都**重新采集**（时间在走、用户可能刚改了时区），不做缓存 —— 这层只被
 * `get_current_time` 工具按需触发，调用频率极低，缓存带来的只有"给模型一个过期时间"的风险。
 */
export function collectTimeFacts(): AiTimeFacts {
  const now = new Date()
  const tzKey = getTimezone()
  const tzMeta = getTimezoneMeta(tzKey)

  // 浏览器（操作系统）时区：拿不到时退回展示时区 —— 至少给模型一个可用的 IANA 名
  const browserTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || tzMeta.iana

  /*
    展示时区下的本地时间与星期几、今天日期：**都以用户在「外观」里选的时区为准**
    （全站时间格式化用的就是它，见 `#/lib/timezone`）—— 模型据此回答"今天/昨天"才与
    用户屏幕上看到的一致，而不是与浏览器系统时区一致。
  */
  const nowLocal = formatDateTime(now, { timeZone: tzKey })
  const todayLocal = nowLocal.slice(0, 10)

  // 星期几按**当前界面语言**渲染（不传 undefined —— 那会用浏览器/系统 locale，
  // 用户界面是中文却拿到 "Tuesday"，模型转述给用户时就会中英夹杂）
  const dayOfWeekLocal = new Intl.DateTimeFormat(i18n.resolvedLanguage || 'zh-CN', {
    timeZone: tzMeta.iana,
    weekday: 'long',
  }).format(now)

  return {
    nowIso: now.toISOString(),
    nowUnixSeconds: Math.floor(now.getTime() / 1000),
    // UTC 下的可读形式：`formatDateTime` 的 timeZone 参数收 TimezoneKey，'UTC' 是清单里的一项
    nowUtc: formatDateTime(now, { timeZone: 'UTC' }),
    nowLocal,
    browserTimeZone,
    displayTimeZone: tzMeta.iana,
    displayTimeZoneOffset: getTimezoneOffsetLabel(tzKey),
    dayOfWeekLocal,
    todayLocal,
  }
}
