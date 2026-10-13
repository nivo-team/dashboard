import { HouseIcon } from '@phosphor-icons/react'
import type { PermissionRequirement } from '#/lib/permissions'
import { describe, expect, it } from 'vite-plus/test'
import {
  ALL_NAV_TARGETS,
  ALL_SHELL_NAV_TARGETS,
  collectGroupFeatureRequirements,
  filterNavGroups,
  filterNavTargets,
  filterShellNavItems,
  flattenPermissionRequirements,
  getNavFeatureRequirement,
  NAV_GROUPS,
  type NavGroup,
  type NavItem,
} from './index'

/**
 * 导航过滤管道的用例。
 *
 * 为什么这块最值得测：导航名单是**唯一真值**（铁律 3），侧边栏、命令面板、
 * AI 的页面清单都从它派生 —— 过滤写错的表现是「能进页面却找不到入口」或
 * 「菜单里有但点进去 403」，两种都不会在构建期报错。
 *
 * 造 `fixture` 时有两个**反直觉但真实存在**的规则要注意（下面有用例专门钉住）：
 *
 * 1. 组级判定（默认 `'all'`）收集的是**组 + 组内每一项 + 每个子项**的全部要求，
 *    而不是只读组自己写的 `features` —— 所以「组里任何一项没权限」也会让整组消失；
 * 2. 因此「组还在、但组内项全被过滤」只有在组自身另有能通过的权限时才能观察到。
 */

/** 显式构造权限上下文：测试只看自己给的权限，不读 store、不读机器上的 `.env`。 */
const ctx = (permissions: string[], role = 'user') => ({ role, permissions })

const item = (to: string, features?: string | string[]): NavItem => ({
  label: to,
  to,
  icon: HouseIcon,
  features,
})

const child = (to: string, features?: string | string[]) => ({
  label: to,
  to,
  icon: HouseIcon,
  features,
})

/** 折叠项：`to` 自身不写权限，权限写在子项上（与真实名单里 `/system` 的形状一致）。 */
const folding = (
  to: string,
  children: NavItem['children'],
  mode: 'all' | 'any' = 'all',
): NavItem => ({ ...item(to), groupPermissionMode: mode, children })

const labels = (groups: NavGroup[]) => groups.map((group) => group.items.map((i) => i.to))

describe('getNavFeatureRequirement', () => {
  it('模块简写补全为 `:*`，已含冒号的原样保留', () => {
    expect(getNavFeatureRequirement({ features: 'table-example' })).toBe('table-example:*')
    expect(getNavFeatureRequirement({ features: 'example:read' })).toBe('example:read')
  })

  it('数组逐项补全', () => {
    expect(getNavFeatureRequirement({ features: ['a', 'b:read'] })).toEqual(['a:*', 'b:read'])
  })

  it('feature / permission 都是合法声明方式（features 优先）', () => {
    expect(getNavFeatureRequirement({ feature: 'a' })).toBe('a:*')
    expect(getNavFeatureRequirement({ permission: { any: ['a:read'] } })).toEqual({
      any: ['a:read'],
    })
    expect(getNavFeatureRequirement({ features: 'a:read', feature: 'b:read' })).toBe('a:read')
  })

  it('没有声明任何权限要求时返回 undefined', () => {
    expect(getNavFeatureRequirement({})).toBeUndefined()
    expect(getNavFeatureRequirement()).toBeUndefined()
  })
})

describe('flattenPermissionRequirements', () => {
  it('嵌套数组递归摊平成逐个权限点', () => {
    // 声明的类型只允许一层数组，实现却按 `Array.isArray` 递归 —— 这里刻意越界喂它两层
    const nested = ['a:read', ['b:read', ['c:read']]] as unknown as PermissionRequirement

    expect(flattenPermissionRequirements(nested)).toEqual(['a:read', 'b:read', 'c:read'])
  })

  it('空值返回空数组；对象要求原样保留', () => {
    expect(flattenPermissionRequirements(undefined)).toEqual([])
    expect(flattenPermissionRequirements({ any: ['a:read'] })).toEqual([{ any: ['a:read'] }])
  })
})

describe('collectGroupFeatureRequirements', () => {
  it('收集组自身 + 项 + 子项，并摊平', () => {
    const group: NavGroup = {
      features: ['a:read', 'b:read'],
      items: [folding('/x', [child('/x/y', 'd:read')], 'any'), item('/z', 'c:read')],
    }

    expect(collectGroupFeatureRequirements(group)).toEqual([
      'a:read',
      'b:read',
      'd:read',
      'c:read',
    ])
  })
})

describe('filterNavGroups', () => {
  it('没写权限要求的项对任何人都可见', () => {
    const groups: NavGroup[] = [{ items: [item('/home')] }]
    expect(filterNavGroups(groups, { context: ctx([]) })).toHaveLength(1)
  })

  it('单项缺权限时隐藏：无权限要求的项保留，未命中的项剔除', () => {
    const groups: NavGroup[] = [
      {
        groupPermissionMode: 'any',
        items: [item('/home'), item('/a', 'a:read'), item('/b', 'b:read')],
      },
    ]

    expect(labels(filterNavGroups(groups, { context: ctx(['a:read']) }))).toEqual([['/home', '/a']])
    expect(labels(filterNavGroups(groups, { context: ctx(['a:read', 'b:read']) }))).toEqual([
      ['/home', '/a', '/b'],
    ])
  })

  it('组级判定会把组内各项的要求一并收集（缺任一项权限则整组隐藏）', () => {
    const groups: NavGroup[] = [{ items: [item('/a', 'a:read'), item('/b', 'b:read')] }]

    expect(filterNavGroups(groups, { context: ctx(['a:read', 'b:read']) })).toHaveLength(1)
    expect(filterNavGroups(groups, { context: ctx(['a:read']) })).toEqual([])
  })

  it("组级 'any'：命中任一权限点即可见（数组走 ALL 会漏掉这种情况）", () => {
    const groups: NavGroup[] = [
      {
        features: ['a:read', 'b:read'],
        groupPermissionMode: 'any',
        items: [item('/a', 'a:read'), item('/b', 'b:read')],
      },
    ]

    // 组保留，且无权的那一项仍被收敛掉
    expect(labels(filterNavGroups(groups, { context: ctx(['b:read']) }))).toEqual([['/b']])
  })

  it("折叠项默认 'all'：缺任一子项权限则整项隐藏", () => {
    const groups: NavGroup[] = [
      {
        groupPermissionMode: 'any',
        items: [
          folding('/sys', [child('/sys/a', 'a:read'), child('/sys/b', 'b:read')]),
          folding('/keep', [child('/keep/x', 'keep:read')], 'any'),
        ],
      },
    ]

    // /sys 子项权限齐全 → 保留；只有 a:read 时 /sys 整项消失，/keep 不受影响
    expect(
      labels(
        filterNavGroups(groups, { context: ctx(['a:read', 'b:read', 'keep:read']) }),
      ),
    ).toEqual([['/sys', '/keep']])
    expect(labels(filterNavGroups(groups, { context: ctx(['a:read', 'keep:read']) }))).toEqual([
      ['/keep'],
    ])
  })

  it("折叠项 'any'：无权子项被收敛，但只要还剩一个就保留整项", () => {
    const groups: NavGroup[] = [
      {
        groupPermissionMode: 'any',
        items: [
          folding('/sys', [child('/sys/a', 'a:read'), child('/sys/b', 'b:read')], 'any'),
          folding('/keep', [child('/keep/x', 'keep:read')], 'any'),
        ],
      },
    ]

    const filtered = filterNavGroups(groups, { context: ctx(['a:read', 'keep:read']) })
    expect(labels(filtered)).toEqual([['/sys', '/keep']])
    expect(filtered[0]?.items[0]?.children?.map((c) => c.to)).toEqual(['/sys/a'])
  })

  it("折叠项 'any'：所有子项都无权时整项被修剪，同组其它项不受影响", () => {
    const groups: NavGroup[] = [
      {
        groupPermissionMode: 'any',
        items: [
          folding('/sys', [child('/sys/a', 'a:read')], 'any'),
          folding('/keep', [child('/keep/x', 'keep:read')], 'any'),
        ],
      },
    ]

    expect(labels(filterNavGroups(groups, { context: ctx(['keep:read']) }))).toEqual([['/keep']])
  })

  it('组内所有项都被过滤时整组消失（即便组自身权限通过）', () => {
    const groups: NavGroup[] = [
      {
        features: 'group:read',
        groupPermissionMode: 'any',
        items: [item('/a', 'a:read')],
      },
    ]

    expect(filterNavGroups(groups, { context: ctx(['group:read']) })).toEqual([])
    expect(labels(filterNavGroups(groups, { context: ctx(['group:read', 'a:read']) }))).toEqual([
      ['/a'],
    ])
  })

  it('自定义 itemFilters / groupFilters 生效', () => {
    const groups: NavGroup[] = [
      { label: 'keep', items: [item('/a'), item('/b')] },
      { label: 'drop', items: [item('/c')] },
    ]

    const filtered = filterNavGroups(groups, {
      context: ctx([]),
      itemFilters: [(navItem) => navItem.to !== '/b'],
      groupFilters: [(group) => group.label === 'keep'],
    })

    expect(labels(filtered)).toEqual([['/a']])
  })

  it('enablePermissionFilter: false 时不看权限，但自定义谓词仍然生效', () => {
    const groups: NavGroup[] = [{ items: [item('/a', 'a:read'), item('/b')] }]

    expect(
      filterNavGroups(groups, { context: ctx([]), enablePermissionFilter: false })[0]?.items.map(
        (i) => i.to,
      ),
    ).toEqual(['/a', '/b'])

    expect(
      filterNavGroups(groups, {
        context: ctx([]),
        enablePermissionFilter: false,
        itemFilters: [(navItem) => navItem.to !== '/a'],
      })[0]?.items.map((i) => i.to),
    ).toEqual(['/b'])
  })

  it('超管（Super Admin）看到全量', () => {
    const groups: NavGroup[] = [
      { features: ['a:read', 'b:read'], items: [item('/a', 'a:read'), item('/b', 'b:read')] },
    ]

    expect(filterNavGroups(groups, { context: ctx([], 'Super Admin') })).toHaveLength(1)
  })

  it('回归：只有 dict:read 时「系统」组可见，且只剩数据字典', () => {
    const filtered = filterNavGroups(NAV_GROUPS, { context: ctx(['dict:read']) })

    // 仪表盘无需权限 + 系统组 'any' 命中 dict:read；示例组整组被过滤
    expect(labels(filtered)).toEqual([['/home'], ['/system']])
    expect(filtered[1]?.items[0]?.children?.map((c) => c.to)).toEqual(['/system/data-dict'])
  })
})

describe('filterShellNavItems', () => {
  it('按权限过滤，且自定义 filter 与权限同时生效', () => {
    const items: NavItem[] = [item('/a'), item('/b', 'b:read')]

    expect(filterShellNavItems(items, { context: ctx([]) }).map((i) => i.to)).toEqual(['/a'])
    expect(filterShellNavItems(items, { context: ctx(['b:read']) }).map((i) => i.to)).toEqual([
      '/a',
      '/b',
    ])
    expect(
      filterShellNavItems(items, { context: ctx(['b:read']), filter: (i) => i.to !== '/a' }).map(
        (i) => i.to,
      ),
    ).toEqual(['/b'])
  })
})

describe('filterNavTargets', () => {
  it('按 permission 过滤扁平目标（含 `example:` 简写补全后的通配命中）', () => {
    const withExample = filterNavTargets(ALL_NAV_TARGETS, { context: ctx(['example:read']) })

    expect(withExample.map((t) => t.to)).toContain('/example/table')
    expect(withExample.some((t) => t.to.startsWith('/system'))).toBe(false)
  })

  it('无权限要求的目标对任何人都可见', () => {
    expect(filterNavTargets(ALL_NAV_TARGETS, { context: ctx([]) }).map((t) => t.to)).toEqual([
      '/home',
    ])
  })
})

describe('ALL_SHELL_NAV_TARGETS', () => {
  it('合并两份外壳导航时去重（个人资料两处都有）', () => {
    expect(ALL_SHELL_NAV_TARGETS.filter((t) => t.to === '/settings/profile')).toHaveLength(1)
  })
})
