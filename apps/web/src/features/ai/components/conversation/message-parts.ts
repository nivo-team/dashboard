import type { AiMessagePart } from '#/features/ai/core'
import type { TaskItemData } from '#/features/ai/components/task-card'
import type { AiOutputMode } from '#/lib/store'

/**
 * 「这条消息里哪些东西要画出来」的判定 —— 全部是**纯函数**。
 *
 * 从前这些判断散在 `AiMessageView` 与 `AssistantPart` 的 JSX 中间（读起来像
 * 渲染细节，其实是产品规则），于是没人说得清「工具卡片什么时候不显示」
 * 「任务卡为什么会消失」。收进这里之后每条规则都能单独用例钉住。
 *
 * 四条规则最容易改错：
 * 1. **等待模式下流式期间文字一律不显示**（直到流式结束一次性展示）；
 * 2. **`manage_tasks` 只留最后一张卡**，且**正在跑的那张由输入区上方悬浮展示**，
 *    消息里要静默（否则同一批任务会出现两张卡）；
 * 3. **跳转建议卡永远可见** —— 它是用户「去页面」的唯一入口，不受「显示详细信息」影响；
 * 4. **既没有可见内容、也不在思考时整条消息不渲染** —— 不留一个只占空白的头像。
 */

/** 消息里「用户 + 本条容器」的判定上下文（都是渲染时才知道的值） */
export interface MessageVisibilityOptions {
  outputMode: AiOutputMode
  /** 这一条是不是正在流式生成 */
  streaming: boolean
  /** 「显示详细信息」（设置 → AI，默认关）—— 工具卡片与 token 用量共用一个开关 */
  showDetails: boolean
  /** 本条消息里最后一个 `manage_tasks` 调用的下标（见 `findLastManageTasksIndex`） */
  lastManageTasksIndex: number
}

/** 文本 part 是否可见：等待模式下流式期间一律隐藏，定稿后一次性展示。 */
export function isTextVisible(outputMode: AiOutputMode, streaming: boolean): boolean {
  return outputMode === 'stream' || !streaming
}

/** 把一条消息里所有 text part 拼成一段（用户消息的原文、助手消息的复制内容都用它）。 */
export function collectText(parts: readonly AiMessagePart[]): string {
  return parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

/** 「有没有值得显示的文字」—— 空白串不算（模型刚起手时可能先吐换行）。 */
export function hasVisibleText(
  parts: readonly AiMessagePart[],
  options: { outputMode: AiOutputMode; streaming: boolean },
): boolean {
  return (
    isTextVisible(options.outputMode, options.streaming) &&
    parts.some((part) => part.type === 'text' && part.text.trim().length > 0)
  )
}

/** 思考链此刻是不是正在流式生成（决定「正在思考…」要不要出现）。 */
export function isReasoningStreaming(parts: readonly AiMessagePart[]): boolean {
  return parts.some((part) => part.type === 'reasoning' && part.state === 'streaming')
}

/**
 * 最后一个 `manage_tasks` 调用的下标（找不到给 `-1`）。
 *
 * 倒着找：同一轮里模型可能规划多次，只有最后一次的清单作数。
 */
export function findLastManageTasksIndex(parts: readonly AiMessagePart[]): number {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index]
    if (part?.type === 'tool-call' && part.toolName === 'manage_tasks') return index
  }
  return -1
}

/** 取 `manage_tasks` 的清单（输出优先于入参：执行后以结果为准）。 */
export function readManageTasks(part: AiMessagePart): TaskItemData[] {
  if (part.type !== 'tool-call' || part.toolName !== 'manage_tasks') return []
  const rawInput = part.input as { tasks?: TaskItemData[] } | undefined
  const rawOutput = part.output as { tasks?: TaskItemData[] } | undefined
  return rawOutput?.tasks || rawInput?.tasks || []
}

/**
 * 这张任务卡此刻是不是**由输入区上方的悬浮卡在展示**。
 *
 * 只有「正在跑 + 还有没做完的」才算悬浮：跑完了就该在消息里留下静态的 settled 卡
 * （那是「这轮做了什么」的存档）。空清单不算 —— 没有内容可悬浮。
 */
export function isTaskFloating(part: AiMessagePart, streaming: boolean): boolean {
  const tasks = readManageTasks(part)
  if (tasks.length === 0) return false
  return streaming && !tasks.every((task) => task.status === 'completed')
}

/**
 * 单个 part 是否算「可见内容」（决定整条消息渲染还是不渲染）。
 *
 * 文字的判定见 `isTextVisible`；思考链只要还在流式就算可见（哪怕一个字都还没吐）；
 * 跳转建议卡永远可见；工具卡片看「显示详细信息」，但 `manage_tasks` 例外 ——
 * 它不受那个偏好影响，只在**不是最后一张**或**正在悬浮**时静默（见 `isTaskFloating`）。
 */
export function isPartVisible(
  part: AiMessagePart,
  index: number,
  options: MessageVisibilityOptions,
): boolean {
  if (part.type === 'text') {
    return isTextVisible(options.outputMode, options.streaming) && part.text.trim().length > 0
  }
  if (part.type === 'reasoning') {
    return part.text.trim().length > 0 || part.state === 'streaming'
  }
  if (part.type === 'nav-proposal') return true
  if (part.type === 'tool-call') {
    if (part.toolName === 'manage_tasks') {
      return index === options.lastManageTasksIndex && !isTaskFloating(part, options.streaming)
    }
    return options.showDetails
  }
  return false
}

/**
 * 「正在思考…」要不要显示。
 *
 * 四个条件缺一不可：正在流式、还没有可见文字、思考链也没在流（那时思考链自己就是进度）、
 * 且没有等待审批的卡（审批卡本身就是给用户的动作，旁边再转个圈只会误导）。
 */
export function shouldShowThinking(options: {
  streaming: boolean
  hasVisibleText: boolean
  reasoningStreaming: boolean
  pendingApproval: boolean
}): boolean {
  return (
    options.streaming &&
    !options.hasVisibleText &&
    !options.reasoningStreaming &&
    !options.pendingApproval
  )
}

/**
 * 用户消息里的**图片** part。
 *
 * 两种形状都收：新的 `attachment`（`kind === 'image'`）与旧存档里的 `image` part
 * （见 `AiMessagePart` 上那条 `@deprecated`）—— 旧会话的图因此还能预览。
 */
export type UserImagePart =
  | Extract<AiMessagePart, { type: 'image' }>
  | (Extract<AiMessagePart, { type: 'attachment' }> & { kind: 'image' })

/** 用户消息里的**文本文件** part（md / txt）：内容已作为文本发给模型，气泡里只给一张卡片。 */
export type UserTextFilePart = Extract<AiMessagePart, { type: 'attachment' }> & { kind: 'text' }

/**
 * 把用户消息的 part 分成「要预览的图」与「只报文件名的文本文件」。
 *
 * 只发附件不打字时也只渲染附件那一块 —— 所以渲染侧拿到的永远是收窄后的两类。
 */
export function splitUserParts(parts: readonly AiMessagePart[]): {
  images: UserImagePart[]
  textFiles: UserTextFilePart[]
} {
  const images: UserImagePart[] = []
  const textFiles: UserTextFilePart[] = []

  for (const part of parts) {
    if (part.type === 'image') {
      images.push(part)
    } else if (part.type === 'attachment') {
      if (part.kind === 'image') images.push(part)
      else if (part.kind === 'text') textFiles.push(part)
    }
  }

  return { images, textFiles }
}
