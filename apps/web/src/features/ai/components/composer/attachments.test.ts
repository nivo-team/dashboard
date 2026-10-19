import { describe, expect, it } from 'vite-plus/test'
import {
  AI_MAX_ATTACHMENTS,
  AI_MAX_IMAGE_BYTES,
  AI_MAX_TEXT_FILE_BYTES,
  formatFileSize,
  isTextFile,
  planAttachments,
  type AttachmentNotice,
} from './attachments'

/**
 * 附件准入的用例。
 *
 * 这块原来混在 `addAttachments` 里、与 `FileReader` 缠在一起，谁都说不清
 * 「同时选了一个 5 MB 的图、一个 .pdf、一个刚好挤掉第四位的 .txt」会弹哪条提示。
 * 现在决策是纯函数，那就把**提示优先级**这条最容易被无声改掉的规则钉住。
 */

/** `planAttachments` 只看这三个字段，所以不必造真的 `File`（node 里也没有 FileReader） */
const file = (name: string, type: string, size: number) => ({ name, type, size }) as unknown as File

const PNG = file('a.png', 'image/png', 1000)
const MD = file('b.md', 'text/markdown', 1000)
const BIG_IMAGE = file('big.png', 'image/png', AI_MAX_IMAGE_BYTES + 1)
const BIG_TEXT = file('big.txt', 'text/plain', AI_MAX_TEXT_FILE_BYTES + 1)
const PDF = file('report.pdf', 'application/pdf', 1)

const noticeOf = (files: readonly File[], existing = 0): AttachmentNotice | undefined =>
  planAttachments(files, existing).notice

describe('planAttachments', () => {
  it('空列表：什么都不收，也不提示', () => {
    expect(planAttachments([], 0)).toEqual({ accepted: [], notice: undefined })
  })

  it('图片按图片收，文本文件按文本收', () => {
    const plan = planAttachments([PNG, MD], 0)

    expect(plan.accepted.map((item) => item.kind)).toEqual(['image', 'text'])
    expect(plan.notice).toBeUndefined()
  })

  it('文本文件认扩展名（系统给不出 MIME 时也要收）', () => {
    expect(isTextFile(file('notes.MD', '', 1))).toBe(true)
    expect(isTextFile(file('notes.txt', 'application/octet-stream', 1))).toBe(true)
    expect(isTextFile(file('notes.pdf', 'application/pdf', 1))).toBe(false)
  })

  it('单个超上限：拦下并说清是哪个上限', () => {
    expect(noticeOf([BIG_IMAGE])).toEqual({ kind: 'tooLarge', size: '4 MB' })
    expect(noticeOf([BIG_TEXT])).toEqual({ kind: 'tooLarge', size: '256 KB' })
  })

  it('刚好到上限不算超（边界是「大于」）', () => {
    expect(noticeOf([file('ok.png', 'image/png', AI_MAX_IMAGE_BYTES)])).toBeUndefined()
    expect(noticeOf([file('ok.txt', 'text/plain', AI_MAX_TEXT_FILE_BYTES)])).toBeUndefined()
  })

  it('类型不在白名单：拦下', () => {
    expect(noticeOf([PDF])).toEqual({ kind: 'unsupported' })
  })

  it('已经加满了：连文件都不看，直接说「放不下了」', () => {
    const plan = planAttachments([PNG], AI_MAX_ATTACHMENTS)

    expect(plan.accepted).toEqual([])
    expect(plan.notice).toEqual({ kind: 'limit' })
  })

  it('剩余空位不够：按空位截断，剩下的报「放不下了」', () => {
    const plan = planAttachments([PNG, MD], AI_MAX_ATTACHMENTS - 1)

    expect(plan.accepted.map((item) => item.file.name)).toEqual(['a.png'])
    expect(plan.notice).toEqual({ kind: 'limit' })
  })

  it('提示优先级：同档内后者覆盖前者（与旧实现逐字一致）', () => {
    expect(noticeOf([PDF, BIG_IMAGE])).toEqual({ kind: 'tooLarge', size: '4 MB' })
    expect(noticeOf([BIG_IMAGE, PDF])).toEqual({ kind: 'unsupported' })
  })

  it('提示优先级：「加满了」压过单文件那类原因', () => {
    expect(planAttachments([BIG_IMAGE, PDF], AI_MAX_ATTACHMENTS).notice).toEqual({ kind: 'limit' })
  })

  it('被拦下的文件不占额度：后面的正常文件照收', () => {
    const plan = planAttachments([BIG_IMAGE, PNG], 0)

    expect(plan.accepted.map((item) => item.file.name)).toEqual(['a.png'])
  })
})

describe('formatFileSize', () => {
  it('按 1024 进制给可读体积，保留一位小数', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
  })
})
