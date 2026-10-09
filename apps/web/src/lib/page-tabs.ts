import type { Icon } from '@phosphor-icons/react'
import { create } from 'zustand'

import { ALL_NAV_TARGETS, ALL_SHELL_NAV_TARGETS } from './navigation'

/**
 * 桌面窗口条的**页面标签页**（page tabs）数据层。
 *
 * 形态是浏览器标签页那一套：你访问过的页面各占一个标签，点谁切谁、关掉就没了。
 * 两条刻意的取舍：
 *
 * 1. **标签 = 导航清单里的一项，而不是「每一个访问过的 URL」**。
 *    依据是 `NAV_GROUPS`（业务导航，`to` 相对 appId）与 `ALL_SHELL_NAV_TARGETS`
 *    （外壳导航，`to` 是绝对路径）—— 于是 `/$appId/system/menus/483`
 *    和 `/$appId/system/menus` 共用「菜单管理」这一个标签，进详情页不会越点越多标签，
 *    也正是 `navigation.ts` 那条「名单只有一个真值」的延续：**加页面不改这里**。
 *
 * 2. **只在内存里，不落盘**。标签页是「这一次开着的东西」，刷新后从当前页重新开始
 *    （与 Chrome 默认不恢复会话一致）。落盘还会带来一个更现实的问题：桌面壳每次启动
 *    都重新加载远程地址，存档里的标签集合与当前 URL 必然对不上，恢复出来的是假的现场。
 *
 * 消费方是 `#/components/page-tab-strip`（由 `#/components/desktop-title-bar` 渲染），
 * **只在桌面壳里挂载**：浏览器里这套东西完全不参与渲染。
 */

/** 一个已打开的标签页。 */
export interface PageTab {
  /**
   * 目标路径（绝对路径、不含查询串）。它同时是标签页的**身份**与点击后的跳转目标 ——
   * 同一个页面上带不同筛选参数（`?page=2`）不该开出第二个标签，所以查询串不进 key。
   */
  to: string
  /** 兜底文案（源语言）。正常情况下用 `labelKey` 翻译，它只在键缺失时兜底。 */
  label: string
  /**
   * `common` 命名空间下的文案键。
   *
   * 标签页**存键不存译文**：切语言时整个窗口条的标题要跟着变，
   * 把解析结果存进 store 就会留下一排旧语言的标题。
   */
  labelKey?: string
  icon?: Icon
}

/**
 * 最长前缀命中：`/system/menus` 命中 `/system/menus` 与 `/system/menus/483`，
 * 取更长的那个（更具体的页面优先）。
 */
function longestPrefixMatch<T extends { to: string }>(
  items: readonly T[],
  path: string,
): T | undefined {
  let hit: T | undefined
  for (const item of items) {
    if (path !== item.to && !path.startsWith(`${item.to}/`)) continue
    if (!hit || item.to.length > hit.to.length) hit = item
  }
  return hit
}

/**
 * 把当前路径解析成一个标签页；解析不出来时返回 `null`（**不生成标签**）。
 *
 * 返回 `null` 的只有两种情况：`/`（应用选择页）与 `/console` 这类只有一段的路径 ——
 * 后者是「访问应用根」的过渡态，`/$appId/index.tsx` 马上会把它重定向到 `/$appId/home`，
 * 此时给它开一个叫「console」的标签只是闪一下的垃圾。
 */
export function resolvePageTab(pathname: string): PageTab | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 2) return null

  const appId = segments[0]
  const subPath = `/${segments.slice(1).join('/')}`

  /*
    两份导航各按自己的基准做最长前缀匹配：
    - 业务导航的 `to` 相对 appId（`/home`），比的是剥掉 appId 的 `subPath`，
      命中后要拼回 `/${appId}${to}` 才是可跳转的绝对路径；
    - 外壳导航的 `to` 本身就是绝对路径（`/settings/profile`），直接比整个 pathname。
    两者不会同时命中（业务命中要求第一段是 appId 且 `subPath` 落在业务清单里），
    真撞上就取路径更长的那个 —— 与「更具体优先」同一条规则。
  */
  const businessHit = longestPrefixMatch(ALL_NAV_TARGETS, subPath)
  const shellHit = longestPrefixMatch(ALL_SHELL_NAV_TARGETS, pathname)
  const businessTo = businessHit ? `/${appId}${businessHit.to}` : ''

  if (businessHit && businessTo.length >= (shellHit?.to.length ?? 0)) {
    return {
      to: businessTo,
      label: businessHit.label,
      labelKey: businessHit.labelKey,
      icon: businessHit.icon,
    }
  }

  if (shellHit) {
    return {
      to: shellHit.to,
      label: shellHit.label,
      labelKey: shellHit.labelKey,
      icon: shellHit.icon,
    }
  }

  // 没登记进导航的路径（外壳内的 404、将来只带动态段的新页面）：拿最后一段当标题
  return { to: pathname, label: segments[segments.length - 1] }
}

interface PageTabsState {
  /** 已打开的标签页，按打开顺序排列（新的追加在行尾，与浏览器一致） */
  tabs: PageTab[]
  /** 打开（或激活）一个标签页：已存在就只更新标题信息，不重复添加 */
  openTab: (tab: PageTab) => void
  /** 关闭一个标签页。**不负责跳转** —— 关掉当前页之后去哪儿由调用方决定 */
  removeTab: (to: string) => void
}

export const usePageTabsStore = create<PageTabsState>()((set) => ({
  tabs: [],
  openTab: (tab) =>
    set((state) => {
      const index = state.tabs.findIndex((item) => item.to === tab.to)
      if (index === -1) return { tabs: [...state.tabs, tab] }
      /*
        已存在：只在「解析结果变了」时替换（例如同一个标签先由兜底文案建出来、
        随后导航清单里有了正式名称）。内容一样就返回原 state，避免无谓的重渲染。
      */
      const existing = state.tabs[index]
      const same =
        existing.label === tab.label &&
        existing.labelKey === tab.labelKey &&
        existing.icon === tab.icon
      if (same) return state
      const tabs = state.tabs.slice()
      tabs[index] = tab
      return { tabs }
    }),
  removeTab: (to) => set((state) => ({ tabs: state.tabs.filter((item) => item.to !== to) })),
}))
