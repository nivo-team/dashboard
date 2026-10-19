import { HouseIcon } from '@phosphor-icons/react'
import { describe, expect, it } from 'vite-plus/test'
import type { AiRouteRefItem } from '#/features/ai/core'
import {
  buildMentionRowIndex,
  matchMentionRows,
  parseMentionQuery,
  toMentionSections,
} from './mention'

/**
 * `@` 引用的用例。
 *
 * 两条规则特别值得钉住，都是「改一行就会静默坏掉」的那种：
 * 1. **`@` 必须是行首或空白之后** —— 否则 `zhang@example.com` 里的 `@example` 也会弹出引用面板；
 * 2. **记录引用的兜底** —— `@table-example:1234` 没有任何一行文案含 `1234`，
 *    少了兜底用户会看到「没有匹配」，而他的输入其实是合法的。
 */

const row = (over: Partial<AiRouteRefItem> & { id: string }): AiRouteRefItem => ({
  kind: 'module',
  token: over.id,
  syntax: `@${over.id}`,
  name: over.id,
  description: '说明',
  icon: HouseIcon,
  keywords: [],
  ...over,
})

const IDS = (rows: readonly AiRouteRefItem[]) => rows.map((item) => item.id)

const ROWS: AiRouteRefItem[] = [
  row({
    id: 'attach',
    kind: 'add',
    token: '',
    syntax: '',
    name: '添加照片和文件',
    keywords: ['file'],
  }),
  row({ id: 'table-example', name: '表格示例', keywords: ['example', '示例'] }),
  row({
    id: 'table-example:list',
    kind: 'page',
    token: 'table-example:list',
    syntax: '@table-example:list',
    name: '列表页',
  }),
  row({
    id: 'table-example:',
    kind: 'record',
    token: 'table-example:',
    syntax: '@table-example:<id>',
    name: '表格示例详情',
    record: true,
  }),
  row({ id: 'system', name: '系统', keywords: ['system'] }),
]

describe('parseMentionQuery', () => {
  it('行首或空白之后的 `@` 才算引用', () => {
    expect(parseMentionQuery('@示例')).toEqual({ query: '示例', start: 0 })
    expect(parseMentionQuery('看看 @table-ex')).toEqual({ query: 'table-ex', start: 3 })
    expect(parseMentionQuery('@table-example:li')).toEqual({ query: 'table-example:li', start: 0 })
  })

  it('邮箱里的 `@` 不算（否则 `zhang@example.com` 会弹面板）', () => {
    expect(parseMentionQuery('zhang@example.com')).toBeNull()
  })

  it('`@` 不在末尾时不算（已经打完了这一段）', () => {
    expect(parseMentionQuery('@示例 你好')).toBeNull()
    expect(parseMentionQuery('@示例')).not.toBeNull()
  })

  it('没有 `@` 时返回 null；`@` 后面空着也算在打引用', () => {
    expect(parseMentionQuery('你好')).toBeNull()
    expect(parseMentionQuery('@')).toEqual({ query: '', start: 0 })
  })
})

describe('matchMentionRows', () => {
  it('查询为空：一行不筛', () => {
    expect(IDS(matchMentionRows(ROWS, ''))).toEqual(IDS(ROWS))
    expect(IDS(matchMentionRows(ROWS, '   '))).toEqual(IDS(ROWS))
  })

  it('名字 / 语法 / 说明 / 关键词四处都能命中，大小写不敏感', () => {
    expect(IDS(matchMentionRows(ROWS, '表格示例'))).toEqual([
      'table-example',
      'table-example:',
    ])
    expect(IDS(matchMentionRows(ROWS, 'list'))).toEqual(['table-example:list'])
    // 语法里带 `example` 的三行都命中（模块 / 页面 / 记录模板）
    expect(IDS(matchMentionRows(ROWS, 'example'))).toEqual([
      'table-example',
      'table-example:list',
      'table-example:',
    ])
    // 说明对所有行都一样，所以全部命中
    expect(IDS(matchMentionRows(ROWS, '说明'))).toEqual(IDS(ROWS))
  })

  it('记录引用的兜底：没人含 ID，就把那一行的「记录」模板留着', () => {
    expect(IDS(matchMentionRows(ROWS, 'table-example:1234'))).toEqual(['table-example:'])
  })

  it('不带 ID 的模块引用照常走普通匹配（不是兜底）', () => {
    expect(IDS(matchMentionRows(ROWS, 'system'))).toEqual(['system'])
  })

  it('冒号在开头（`:x`）不算记录引用，照常报「没有匹配」', () => {
    expect(matchMentionRows(ROWS, ':x')).toEqual([])
  })

  it('认不出来的查询返回空数组（面板据此说「没有匹配」）', () => {
    expect(matchMentionRows(ROWS, 'zzz')).toEqual([])
  })
})

describe('toMentionSections', () => {
  it('按固定段序分段，空段不出现', () => {
    const sections = toMentionSections(ROWS)

    expect(sections.map((section) => section.kind)).toEqual(['add', 'module', 'page', 'record'])
    // 每段保留引用的行对象本身（不是复制），段的键与 fallback 文案都在
    expect(IDS(sections[1].rows)).toEqual(['table-example', 'system'])
    expect(sections[0].fallback).toBe('添加')
  })

  it('没有任何行时不产生空壳段', () => {
    expect(toMentionSections([])).toEqual([])
  })
})

describe('buildMentionRowIndex', () => {
  it('序号是**跨段连续**的（键盘游标走的就是它，段标题不占号）', () => {
    const index = buildMentionRowIndex(ROWS)

    expect(index.get('attach')).toBe(0)
    expect(index.get('table-example')).toBe(1)
    expect(index.get('table-example:list')).toBe(2)
    expect(index.get('table-example:')).toBe(3)
    expect(index.get('system')).toBe(4)
  })
})
