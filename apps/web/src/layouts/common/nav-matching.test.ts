import { describe, expect, it } from 'vite-plus/test'
import { isNavItemActive } from './nav-matching'

/**
 * 侧边栏高亮的回归测试。
 *
 * 这组用例的价值在于：它是**唯一一份**「当前 URL 算不算这一项」的判定，
 * 三个平台变体共用；判错了表现为「点进去菜单不高亮」，很难在人工验收里穷举。
 */
describe('isNavItemActive', () => {
  const prefix = '/nivo'

  describe('应用首页的等价写法', () => {
    it.each(['/nivo', '/nivo/', '/nivo/home', '/nivo/home/'])('%s 命中 /home', (pathname) => {
      expect(isNavItemActive(pathname, '/home', prefix)).toBe(true)
    })

    it('/ 与 /home 是同一种含义', () => {
      expect(isNavItemActive('/nivo/home', '/', prefix)).toBe(true)
      expect(isNavItemActive('/nivo/home', '/home', prefix)).toBe(true)
    })

    it('别的应用前缀不算命中', () => {
      expect(isNavItemActive('/portal/home', '/home', prefix)).toBe(false)
    })
  })

  describe('普通路径', () => {
    it('精确命中', () => {
      expect(isNavItemActive('/nivo/system/roles', '/system/roles', prefix)).toBe(true)
    })

    it('子路径按前缀命中（详情页高亮列表项）', () => {
      expect(isNavItemActive('/nivo/system/roles/42', '/system/roles', prefix)).toBe(true)
      expect(isNavItemActive('/nivo/system/roles/42/edit', '/system/roles', prefix)).toBe(true)
    })

    it('前缀相同的兄弟路径不误命中', () => {
      expect(isNavItemActive('/nivo/system/roles-other', '/system/roles', prefix)).toBe(false)
      expect(isNavItemActive('/nivo/settings-ai', '/settings', prefix)).toBe(false)
    })

    it('路径更短时不命中', () => {
      expect(isNavItemActive('/nivo/system', '/system/roles', prefix)).toBe(false)
    })

    it('首页不等于任何子路径（/home 不是所有页面的前缀匹配）', () => {
      expect(isNavItemActive('/nivo/system/roles', '/home', prefix)).toBe(false)
    })
  })

  describe('应用前缀', () => {
    it('前缀本身就是目标路径时命中', () => {
      expect(isNavItemActive('/nivo', '/', prefix)).toBe(true)
      expect(isNavItemActive('/nivo/', '/', prefix)).toBe(true)
    })

    it('多级应用前缀同样工作', () => {
      expect(isNavItemActive('/a/b/home', '/home', '/a/b')).toBe(true)
      expect(isNavItemActive('/a/b/system', '/system', '/a/b')).toBe(true)
    })
  })
})
