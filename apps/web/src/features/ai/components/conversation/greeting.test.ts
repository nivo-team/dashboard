import { describe, expect, it } from 'vite-plus/test'
import { greetingKeyOf } from './greeting'

/**
 * 空态问候语的用例。
 *
 * 值钱的一条是**看用户选的时区、不看本机时区**：同一瞬间在 `Asia/Shanghai` 是上午、
 * 在 `America/New_York` 却是晚上。写错的表现是「列表里全是上午的时间，问候语却说晚上好」，
 * 而且只在跨时区时才看得见 —— 没有用例就永远发现不了。
 *
 * 时刻全部写死（`greetingKeyOf` 的第二个参数），时刻表与机器时钟无关。
 */

/**
 * 2026-10-13T00:30:00Z —— 同一瞬间三个地方三段各不相同：
 * 上海 08:30（上午）、UTC 00:30（午夜算晚上）、纽约 10-12 20:30（晚上）。
 */
const INSTANT = new Date('2026-10-13T00:30:00.000Z')

describe('greetingKeyOf', () => {
  it('按用户选的时区判断，而不是本机时区', () => {
    expect(greetingKeyOf('Asia/Shanghai', INSTANT)).toBe('morning')
    expect(greetingKeyOf('America/New_York', INSTANT)).toBe('evening')
    expect(greetingKeyOf('UTC', INSTANT)).toBe('evening')
  })

  it('三段的分界：[5, 12) 早上、[12, 18) 下午、其余晚上', () => {
    const at = (iso: string) => greetingKeyOf('UTC', new Date(iso))

    expect(at('2026-10-13T04:59:00Z')).toBe('evening')
    expect(at('2026-10-13T05:00:00Z')).toBe('morning')
    expect(at('2026-10-13T11:59:00Z')).toBe('morning')
    expect(at('2026-10-13T12:00:00Z')).toBe('afternoon')
    expect(at('2026-10-13T17:59:00Z')).toBe('afternoon')
    expect(at('2026-10-13T18:00:00Z')).toBe('evening')
  })

  it('午夜归晚上（`hourCycle: h23` 给出 0 而不是 24）', () => {
    expect(greetingKeyOf('UTC', new Date('2026-10-13T00:00:00Z'))).toBe('evening')
    // 上海次日 00:00（= UTC 16:00）同样是晚上
    expect(greetingKeyOf('Asia/Shanghai', new Date('2026-10-12T16:00:00Z'))).toBe('evening')
  })

  it('缺省用此刻（不抛错即可 —— 只验证契约里那条兜底）', () => {
    expect(['morning', 'afternoon', 'evening']).toContain(greetingKeyOf('UTC'))
  })
})
