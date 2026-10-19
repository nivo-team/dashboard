import type { AiImageFile, AiTextFile } from '#/features/ai/core'

/**
 * 附件的**准入规则与读取** —— 输入区里唯一跟「文件」有关的地方。
 *
 * 拆出来的理由：三道闸（单文件上限 / 总数上限 / 类型白名单）与它们的**提示优先级**
 * 是纯决策，跟 React 状态无关，却原来埋在 `addAttachments` 里和 `FileReader` 混在
 * 一起 —— 于是「多选一个 5 MB 的图 + 一个 .pdf 该弹哪条提示」这种事只能靠人肉推演。
 * 现在决策在 `planAttachments` 里（纯函数，有单测），读文件才需要 DOM API。
 */

/** 一次能带几个附件：再多请求体（以及拼进消息的文本）就过大了，正常提问也用不到 */
export const AI_MAX_ATTACHMENTS = 4

/**
 * 图片单个上限。图片会以 **data URL** 同时进请求体与会话存档（base64 还会放大 ~1/3）。
 */
export const AI_MAX_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * 文本文件（md / txt）单个上限。内容会被**解析出来拼进这一轮的 user 消息**、直接吃上下文，
 * 所以比图片严得多：256 KB 已经能装下一份不短的文档了。
 */
export const AI_MAX_TEXT_FILE_BYTES = 256 * 1024

/** 只收这几类文本文件：扩展名与 MIME **双认**（有些系统给不出 markdown 的 MIME） */
const TEXT_FILE_EXTENSIONS = /\.(md|markdown|txt)$/i

export function isTextFile(file: File): boolean {
  return (
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    TEXT_FILE_EXTENSIONS.test(file.name)
  )
}

/** 附件卡片上的体积文案（1024 进制，保留一位小数就够读了） */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `File` → `AiImageFile`（data URL）。读失败就抛，由调用方兜成一条提示 */
export function fileToImageFile(file: File): Promise<AiImageFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // `readAsDataURL` 按契约返回字符串；显式收窄，避免 `String(result)` 落到 `[object Object]`
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('read failed'))
        return
      }
      resolve({
        kind: 'image',
        url: result,
        // 少数文件系统回来的 `file.type` 是空串 —— 回落成通用图片类型
        mediaType: file.type || 'image/png',
        // 粘贴来的截图没有文件名，那就只靠媒体类型
        ...(file.name ? { name: file.name } : {}),
        size: file.size,
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * `File` → `AiTextFile`：**在客户端**就把内容读出来（`File.text()`）。
 * 之后随消息当文本发出去，不做二进制上传 —— 这样任何厂商都能读，不依赖它对文档格式的支持。
 */
export async function fileToTextFile(file: File): Promise<AiTextFile> {
  return {
    kind: 'text',
    name: file.name,
    size: file.size,
    text: await file.text(),
  }
}

/**
 * 被拦下的原因。**说键不说文案**：这一层是纯逻辑，不该知道当前语言；
 * 翻译在渲染层一次性完成（见 `composer/index.tsx` 的 `notifyAttachment`）。
 */
export type AttachmentNotice =
  /** 单个文件超上限（`size` 是给提示文案插值用的可读体积） */
  | { kind: 'tooLarge'; size: string }
  /** 类型不在白名单（图片 / md / txt 之外的一切） */
  | { kind: 'unsupported' }
  /** 加满了：`AI_MAX_ATTACHMENTS` 是图片与文本文件**共用**的额度 */
  | { kind: 'limit' }
  /** 读不出来（FileReader / File.text 抛错），只影响个别文件 */
  | { kind: 'unreadable' }

/** 通过三道闸、可以读进来的一个文件，`kind` 决定用什么读法 */
export interface PlannedAttachment {
  file: File
  kind: 'image' | 'text'
}

export interface AttachmentPlan {
  /** 收得下的文件（已按剩余额度截断）；读它才是 `FileReader` 的活 */
  accepted: PlannedAttachment[]
  /**
   * 该弹的那**一条**提示。优先级（与原实现逐字一致）：
   * 「加满了」> 逐个文件的「收不下」（同档内**后者覆盖前者**）> 「读不出来」。
   * 一条都不该弹时为 `undefined` —— 「刚好加到满」不算被拦下。
   */
  notice?: AttachmentNotice
}

/**
 * 收附件的**决策**部分：哪些收得下、该跟用户说什么。
 *
 * 只看 `file.type` / `file.name` / `file.size`，**不读文件内容**（所以纯、可测）。
 * `existingCount` 是输入框里已有的附件数 —— 额度是图片与文本文件共用的。
 */
export function planAttachments(
  files: readonly File[],
  existingCount: number,
): AttachmentPlan {
  /*
    已经满了：连文件都不用看，直接说「放不下了」。
    这条提示曾经是静默丢掉的（旧写法把它写在 `setAttachments` 的 updater 里，
    紧接着被外层那句「没有拦截原因」覆盖，于是用户只觉得多选的文件凭空少了几个）。
  */
  const room = Math.max(AI_MAX_ATTACHMENTS - existingCount, 0)
  if (room === 0) return { accepted: [], notice: { kind: 'limit' } }

  const accepted: PlannedAttachment[] = []
  let notice: AttachmentNotice | undefined

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (file.size > AI_MAX_IMAGE_BYTES) {
        notice = { kind: 'tooLarge', size: '4 MB' }
        continue
      }
      accepted.push({ file, kind: 'image' })
      continue
    }

    if (isTextFile(file)) {
      if (file.size > AI_MAX_TEXT_FILE_BYTES) {
        notice = { kind: 'tooLarge', size: '256 KB' }
        continue
      }
      accepted.push({ file, kind: 'text' })
      continue
    }

    notice = { kind: 'unsupported' }
  }

  // 数量闸：截到剩余空位。数量超了时压过单文件那类原因 —— 此刻用户最该先知道的是「放不下了」
  const kept = accepted.slice(0, room)
  if (accepted.length > kept.length) notice = { kind: 'limit' }

  return { accepted: kept, notice }
}
