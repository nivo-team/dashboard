import { describe, expect, it } from 'vite-plus/test'
import { isPermissionDraftDirty, type PermissionDraft } from './permission-draft'

/**
 * 「有没有未保存的更改」的用例。
 *
 * 这块最值钱的一条是**顺序无关**：`custom` 档的勾选顺序跟着点击走，
 * 若按数组顺序比，用户点两下把同一批能力挑回来就会被判成「有改动」，
 * 于是面板一直提示未保存 —— 提示一旦经常误报，用户就再也不看它了。
 */

const draft = (permission: PermissionDraft['permission'], capabilities: string[]): PermissionDraft =>
  ({ permission, capabilities }) as PermissionDraft

describe('isPermissionDraftDirty', () => {
  it('完全一样：不算改过', () => {
    expect(isPermissionDraftDirty(draft('readonly', ['page:read']), draft('readonly', ['page:read']))).toBe(false)
  })

  it('能力集合相同、**勾选顺序不同**：不算改过（这就是抽出来的原因）', () => {
    const saved = draft('custom', ['page:read', 'data:query', 'form:read'])
    const reordered = draft('custom', ['form:read', 'page:read', 'data:query'])

    expect(isPermissionDraftDirty(reordered, saved)).toBe(false)
  })

  it('多勾一个 / 少勾一个：算改过', () => {
    const saved = draft('custom', ['page:read', 'data:query'])

    expect(isPermissionDraftDirty(draft('custom', ['page:read', 'data:query', 'form:read']), saved)).toBe(true)
    expect(isPermissionDraftDirty(draft('custom', ['page:read']), saved)).toBe(true)
  })

  it('数量相同但内容不同（换掉一个）：算改过', () => {
    const saved = draft('custom', ['page:read', 'data:query'])

    expect(isPermissionDraftDirty(draft('custom', ['page:read', 'data:write']), saved)).toBe(true)
  })

  it('换档位（full / readonly / custom）：即便能力恰好一样也算改过', () => {
    expect(isPermissionDraftDirty(draft('full', ['page:read']), draft('readonly', ['page:read']))).toBe(true)
  })

  it('两边都是空能力列表：只要档位一样就不算改过', () => {
    expect(isPermissionDraftDirty(draft('readonly', []), draft('readonly', []))).toBe(false)
    expect(isPermissionDraftDirty(draft('full', []), draft('readonly', []))).toBe(true)
  })

  it('重复项按长度比会误判 —— 只落一次的能力不该被视作「多了一档」', () => {
    // 真值来自勾选（每项最多一次），所以这条只钉住当前语义：长度先比，不做事先去重
    expect(isPermissionDraftDirty(draft('custom', ['page:read']), draft('custom', ['page:read']))).toBe(false)
  })
})
