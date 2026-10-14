import { describe, expect, it } from 'vite-plus/test'
import type { AiMessagePart } from '#/features/ai/core'
import type { TaskItemData } from '#/features/ai/components/task-card'
import {
  collectText,
  findLastManageTasksIndex,
  hasVisibleText,
  isPartVisible,
  isReasoningStreaming,
  isTaskFloating,
  isTextVisible,
  readManageTasks,
  shouldShowThinking,
  splitUserParts,
  type MessageVisibilityOptions,
} from './message-parts'

/**
 * 「这条消息里哪些要画出来」的用例。
 *
 * 这些规则从前埋在 JSX 里、只能靠肉眼读，错了的症状全是**静默的**：
 * 等待模式下文字提前冒出来、任务卡出现两张、工具卡片明明关了还在、
 * 或者一条消息什么都没画却留下一个空头像。逐条钉住。
 */

const text = (value: string): AiMessagePart => ({ type: 'text', text: value })
const reasoning = (
  value: string,
  state: 'streaming' | 'done' = 'done',
): AiMessagePart => ({ type: 'reasoning', text: value, state })

const toolCall = (
  toolName: string,
  over: Partial<Extract<AiMessagePart, { type: 'tool-call' }>> = {},
): AiMessagePart => ({
  type: 'tool-call',
  toolCallId: `call-${toolName}`,
  toolName,
  input: {},
  state: 'done',
  ...over,
})

const task = (id: string, status: TaskItemData['status']): TaskItemData => ({
  id,
  title: id,
  status,
})

const manageTasks = (tasks: TaskItemData[], over: Record<string, unknown> = {}): AiMessagePart =>
  toolCall('manage_tasks', { input: { tasks }, ...over })

/** 全套可见性上下文，用例只覆盖自己关心的一两项 */
const options = (over: Partial<MessageVisibilityOptions> = {}): MessageVisibilityOptions => ({
  outputMode: 'stream',
  streaming: false,
  showDetails: false,
  lastManageTasksIndex: -1,
  ...over,
})

describe('isTextVisible', () => {
  it('stream 模式随时可见；wait 模式流式期间隐藏、定稿后可见', () => {
    expect(isTextVisible('stream', true)).toBe(true)
    expect(isTextVisible('wait', true)).toBe(false)
    expect(isTextVisible('wait', false)).toBe(true)
  })
})

describe('collectText', () => {
  it('只拼 text part，其余忽略', () => {
    expect(collectText([text('你好'), reasoning('想'), toolCall('read_api'), text('！')])).toBe(
      '你好！',
    )
  })

  it('没有文字时是空串（调用方据此判断要不要显示复制按钮）', () => {
    expect(collectText([toolCall('read_api')])).toBe('')
  })
})

describe('hasVisibleText', () => {
  it('空白串不算文字（模型起手常常先吐换行）', () => {
    expect(hasVisibleText([text('\n  ')], { outputMode: 'stream', streaming: true })).toBe(false)
    expect(hasVisibleText([text('a')], { outputMode: 'stream', streaming: true })).toBe(true)
  })

  it('wait 模式流式期间即便有文字也算「没有可见文字」', () => {
    expect(hasVisibleText([text('半句')], { outputMode: 'wait', streaming: true })).toBe(false)
  })
})

describe('isReasoningStreaming', () => {
  it('只要有思考链正在流式就是真', () => {
    expect(isReasoningStreaming([reasoning('想', 'streaming')])).toBe(true)
    expect(isReasoningStreaming([reasoning('想完了', 'done')])).toBe(false)
  })
})

describe('findLastManageTasksIndex', () => {
  it('取最后一个 manage_tasks（同一轮可能规划多次，只有最后一次作数）', () => {
    const parts = [manageTasks([task('a', 'pending')]), text('中间'), manageTasks([])]

    expect(findLastManageTasksIndex(parts)).toBe(2)
  })

  it('没有 manage_tasks 时给 -1', () => {
    expect(findLastManageTasksIndex([text('你好'), toolCall('read_api')])).toBe(-1)
  })
})

describe('readManageTasks', () => {
  it('输出优先于入参（执行后以结果为准）', () => {
    const part = manageTasks([task('旧', 'pending')], {
      output: { tasks: [task('新', 'completed')] },
    })

    expect(readManageTasks(part).map((item) => item.id)).toEqual(['新'])
  })

  it('两者都没有时给空数组；非 manage_tasks 的 part 也给空数组', () => {
    expect(readManageTasks(manageTasks([]))).toEqual([])
    expect(readManageTasks(toolCall('read_api'))).toEqual([])
    expect(readManageTasks(text('你好'))).toEqual([])
  })
})

describe('isTaskFloating', () => {
  it('正在跑且还有没做完的：算悬浮（消息里要静默）', () => {
    expect(isTaskFloating(manageTasks([task('a', 'completed'), task('b', 'pending')]), true)).toBe(
      true,
    )
  })

  it('全做完 / 不在流式 / 空清单：都不算悬浮（消息里留下静态卡）', () => {
    expect(isTaskFloating(manageTasks([task('a', 'completed')]), true)).toBe(false)
    expect(isTaskFloating(manageTasks([task('a', 'pending')]), false)).toBe(false)
    expect(isTaskFloating(manageTasks([]), true)).toBe(false)
  })
})

describe('isPartVisible', () => {
  it('文字：走 isTextVisible，空白串不算', () => {
    expect(isPartVisible(text('a'), 0, options({ outputMode: 'wait', streaming: true }))).toBe(false)
    expect(isPartVisible(text('  '), 0, options())).toBe(false)
    expect(isPartVisible(text('a'), 0, options())).toBe(true)
  })

  it('思考链：有字或正在流式都算可见', () => {
    expect(isPartVisible(reasoning('想', 'done'), 0, options())).toBe(true)
    expect(isPartVisible(reasoning('', 'streaming'), 0, options())).toBe(true)
    expect(isPartVisible(reasoning('  ', 'done'), 0, options())).toBe(false)
  })

  it('跳转建议卡永远可见（不受「显示详细信息」影响）', () => {
    const part: AiMessagePart = {
      type: 'nav-proposal',
      id: 'nav-1',
      label: '表格示例',
      path: '/example/table',
      state: 'pending',
    }

    expect(isPartVisible(part, 0, options({ showDetails: false }))).toBe(true)
  })

  it('普通工具卡：跟着「显示详细信息」这个开关', () => {
    expect(isPartVisible(toolCall('read_api'), 0, options({ showDetails: false }))).toBe(false)
    expect(isPartVisible(toolCall('read_api'), 0, options({ showDetails: true }))).toBe(true)
  })

  it('任务卡不受那个开关影响，但只有最后一张、且不在悬浮时算可见', () => {
    const parts = [manageTasks([task('a', 'pending')]), manageTasks([task('b', 'pending')])]

    const visible = (index: number, streaming: boolean) =>
      isPartVisible(parts[index] as AiMessagePart, index, {
        ...options({ showDetails: false, streaming, lastManageTasksIndex: 1 }),
      })

    // 第 0 张不是最后一次规划 → 静默；第 1 张正在悬浮 → 也静默
    expect(visible(0, false)).toBe(false)
    expect(visible(1, true)).toBe(false)
    // 跑完了：第 1 张留在消息里
    expect(visible(1, false)).toBe(true)
  })
})

describe('shouldShowThinking', () => {
  const base = {
    streaming: true,
    hasVisibleText: false,
    reasoningStreaming: false,
    pendingApproval: false,
  }

  it('四个条件都满足才有「正在思考…」', () => {
    expect(shouldShowThinking(base)).toBe(true)
  })

  it('已经有可见文字、思考链在流、或在等审批：都不显示', () => {
    expect(shouldShowThinking({ ...base, hasVisibleText: true })).toBe(false)
    expect(shouldShowThinking({ ...base, reasoningStreaming: true })).toBe(false)
    expect(shouldShowThinking({ ...base, pendingApproval: true })).toBe(false)
    expect(shouldShowThinking({ ...base, streaming: false })).toBe(false)
  })
})

describe('splitUserParts', () => {
  it('图片与文本文件分开，新老两种图片 part 都收', () => {
    const parts: AiMessagePart[] = [
      text('看看这个'),
      { type: 'image', url: 'blob:old', mediaType: 'image/png', name: '旧图.png' },
      { type: 'attachment', kind: 'text', name: 'notes.md', size: 12, text: '# 笔记' },
      {
        type: 'attachment',
        kind: 'image',
        url: 'blob:new',
        mediaType: 'image/png',
        name: '新图.png',
        size: 2048,
      },
    ]

    const { images, textFiles } = splitUserParts(parts)

    expect(images.map((image) => image.name)).toEqual(['旧图.png', '新图.png'])
    expect(textFiles.map((file) => file.name)).toEqual(['notes.md'])
  })

  it('没有附件时两个列表都是空的（渲染侧据此整块不画）', () => {
    expect(splitUserParts([text('只是打字')])).toEqual({ images: [], textFiles: [] })
  })
})
