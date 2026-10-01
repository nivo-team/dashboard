import { ensureUserPermissions } from '#/lib/permissions'
import { getQueryClient } from '#/lib/query-client'
import { getActiveModel, usePreferencesStore } from '#/lib/store'
import { hasPageFormCapability, listAiForms } from './form-bridge'
import { getAiShellBridge, getPageContext } from './page-context'
import { resolveAiPageContext } from './page-context-registry'
import { collectPromptFacts, resolveOutputLanguageName } from './prompt-facts'
import { addSessionGrant, hasSessionGrant } from './session-permissions'
import { useAiSessionStore } from './session-store'
import { getAllowedTools } from './tools'
import type {
  AiApprovalDecision,
  AiApprovalRequest,
  AiAttachment,
  AiMode,
  AiSurface,
  AiToolContext,
} from './types'

/**
 * 「发一条消息」的驱动逻辑：把 UI 的一个动作串成「建消息 → 跑运行时 → 消费事件流」。
 *
 * 放在模块函数而不是 hook 里，是因为它要**在组件之外**跑完一整轮：
 * 用户切页面、面板重渲染都不该打断或重启这一轮。React 侧只负责读 store 渲染。
 */

let activeController: AbortController | null = null

/**
 * 挂起的审批：id → 决定回调。
 *
 * 刻意放在模块级 Map 而不是 store 里：Promise 的 resolver 不是渲染数据，
 * 放进 state 只会让每次 set 都带一个函数引用。store 里只留「给人看的」那条 `pendingApproval`。
 *
 * 回传的是**三态决定**（`AiApprovalDecision`）而不是布尔：只有 `session` 才写会话授权，
 * `once` 是一次性放行 —— 否则「允许一次」会被内存授权表放大成"本会话不再问"。
 */
const approvalResolvers = new Map<
  string,
  (decision: AiApprovalDecision) => void
>()

function createApprovalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 把一条审批请求交给 UI，并等用户决定。
 *
 * 这是写操作与跳转**唯一**的执行前置：工具里 `await requestApproval(...)`，
 * 拿到 `false` 就抛错（让模型知道用户不同意，工具描述里也写了不要重试）。
 */
function requestApproval(request: AiApprovalRequest): Promise<boolean> {
  const activeSessionId = useAiSessionStore.getState().activeSessionId
  if (hasSessionGrant(request.toolName, activeSessionId)) {
    return Promise.resolve(true)
  }

  const id = createApprovalId()
  return new Promise<boolean>((resolve) => {
    approvalResolvers.set(id, (decision) => {
      approvalResolvers.delete(id)
      /*
        只有「本会话」才落授权（`session-permissions` 按 session 隔离、sessionStorage、
        刷新失效）。`once` **什么都不写** —— 那是「就这一次」的字面意思。
      */
      if (decision === 'session') {
        addSessionGrant(request.toolName, activeSessionId, true)
      }
      resolve(decision !== 'deny')
    })
    useAiSessionStore.getState().setPendingApproval({ id, ...request })
  })
}

/**
 * 用户在卡片上的决定。
 *
 * 找不到这个 id 时**什么都不做**（fail-closed）：卡片可能已经被中止流程收掉了，
 * 这时拿不到明确决定就绝不执行。
 */
export function resolveAiApproval(id: string, decision: AiApprovalDecision): void {
  const resolver = approvalResolvers.get(id)
  if (!resolver) return
  resolver(decision)
  useAiSessionStore.getState().clearPendingApproval()
}

/** 中止 / 异常收尾：挂起的审批一律按「拒绝」了结，不能让工具永远挂在那里。 */
function rejectPendingApprovals(): void {
  for (const [id, resolver] of approvalResolvers) {
    approvalResolvers.delete(id)
    resolver('deny')
  }
  useAiSessionStore.getState().clearPendingApproval()
}

/**
 * 工具执行上下文。
 *
 * 三样能力都不需要 React 注入：`queryClient` 有按作用域取实例的工厂、
 * 导航走外壳桥（`AppShell` 挂载时注册）、页面上下文直接读 `window.location`。
 * 这样 `navigate_to` / `call_read_api` 才能在非组件环境里正常工作。
 *
 * 另外两样是**这一轮的环境**（都由调用方决定，工具只读）：
 * - `surface`：面板还是全屏 —— 决定跳转是"确认卡"还是"建议卡"；
 * - `autoNavigate`：询问模式下开了「自动跳转」就直接跳（**自动模式本来就不问**，
 *   所以工具里的条件是 `mode === 'ask' && !autoNavigate`）。
 * 两者都**不改变可用工具清单**（那在 `getAllowedTools` 里按 surface 收口）。
 */
function buildToolContext(
  mode: AiMode,
  surface: AiSurface,
  /** 本轮用户消息的原始文本（`check_result_match` 校验探测值来源用） */
  userMessageText: string,
): AiToolContext {
  return {
    queryClient: getQueryClient(),
    // 工具的审批策略看它（权限那维只管"有没有这个工具"）
    mode,
    surface,
    autoNavigate: usePreferencesStore.getState().aiAutoNavigate,
    navigate: (to) => {
      getAiShellBridge()?.navigate(to)
    },
    getPageContext,
    requestApproval,
    getUserMessageText: () => userMessageText,
    bumpToolCounter: (key) => useAiSessionStore.getState().bumpToolCounter(key),
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

/**
 * 发送一条用户消息并跑完助手这一轮。
 *
 * 事件流在 `for await` 里逐条写进 store：文本增量续写到同一个文本 part，
 * 工具调用建 part、工具结果回填状态 —— 于是「正在调用某个工具」是**真实状态**，
 * 不是靠计时器演的动画。
 *
 * `attachments` 是随文发出的附件（图片或普通文件，data URL）；**只有附件、没有文字也可以发**
 * （截图直接甩进来问「这是什么」是常见用法），所以判空要看「文字与附件都空」。
 */
/**
 * 流式文本事件批处理器：将高频的单个 token / 增量合并为平滑帧（~25ms，约 40fps），
 * 避免每秒触发数十上百次 React 全树重渲染与 DOM 同步重排，从根本上解决流式输出卡顿。
 */
class StreamEventBatcher {
  private assistantId: string
  private pendingText = ''
  private pendingReasoning = ''
  private lastFlushTime = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_INTERVAL_MS = 25

  constructor(assistantId: string) {
    this.assistantId = assistantId
  }

  push(event: AiStreamEvent): void {
    if (event.type === 'text') {
      if (this.pendingReasoning) this.flush()
      this.pendingText += event.text
      this.scheduleFlush()
      return
    }

    if (event.type === 'reasoning') {
      if (this.pendingText) this.flush()
      this.pendingReasoning += event.text
      this.scheduleFlush()
      return
    }

    // 其余结构化事件（tool-call / finish / error 等）：立刻清空文本缓冲并同步派发
    this.flush()
    useAiSessionStore.getState().applyEvent(this.assistantId, event)
  }

  private scheduleFlush(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
      this.flush()
      return
    }

    if (this.flushTimer === null) {
      const wait = Math.max(0, this.FLUSH_INTERVAL_MS - (now - this.lastFlushTime))
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, wait)
    }
  }

  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (this.pendingReasoning) {
      const text = this.pendingReasoning
      this.pendingReasoning = ''
      this.lastFlushTime = now
      useAiSessionStore.getState().applyEvent(this.assistantId, {
        type: 'reasoning',
        text,
      })
    }

    if (this.pendingText) {
      const text = this.pendingText
      this.pendingText = ''
      this.lastFlushTime = now
      useAiSessionStore.getState().applyEvent(this.assistantId, {
        type: 'text',
        text,
      })
    }
  }
}

export async function sendAiMessage(
  text: string,
  mode: AiMode,
  attachments: readonly AiAttachment[] = [],
  /**
   * 当前容器 —— **由渲染处显式传入**（`AiComposer` 的 `surface` prop），
   * 不要用 `window.location` 反推：路由名的字符串匹配会在重命名后静默失配。
   */
  surface: AiSurface = 'panel',
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed && attachments.length === 0) return

  const store = useAiSessionStore.getState()
  if (store.status === 'streaming') return

  /*
    走中间层后**不再要求前端配置模型**：真实模型与凭证都在服务端（AI Gateway + Worker secret）。
    前端那份 `admin.ai` 配置只剩「能力声明」用途（是否支持工具调用 / 思考档位 / 图片支持），
    缺失时按「支持」处理 —— 这里原来会直接 failTurn，那个前提已经不成立了。
  */
  const capabilities = getActiveModel()?.model

  const assistantId = store.beginTurn(trimmed, attachments)
  /*
    用户的问题**立刻落盘**：助手回复到一半刷新页面，问题也不该丢。

    这里刻意 `await`（而不是 `void`）：**会话级授权按 `activeSessionId` 记账**
    （见 `session-permissions.ts`），新对话在第一次落盘之前只有草稿作用域 ——
    不等这次写入完成，工具在这一轮里写下的授权（例如跳转的 `navigate`）就会挂到草稿上，
    等会话拿到真实 id 后凭空失效，表现成「刚同意过又问一次」。
    落盘失败**不阻断这一轮**：对话照常跑，只是刷新后可能丢这一笔。
  */
  await useAiSessionStore.getState().persist().catch(() => undefined)

  const controller = new AbortController()
  activeController = controller
  let batcher: StreamEventBatcher | null = null

  try {
    /*
      运行时**按需加载**：`runtime` 会带上 `ai` 与三个 provider 包（几百 KB），
      静态 import 会把它们塞进主 bundle —— 而打开面板、浏览页面根本不需要它们。
      第一次真正发送消息时才下载，之后走模块缓存。
    */
    const { streamAssistantTurn, toModelMessages } = await import('./runtime')

    // 注意取的是**追加完用户消息之后**的历史：`beginTurn` 已经把本轮问题写进去了
    const messages = toModelMessages(useAiSessionStore.getState().messages)

    /*
      两个维度在这里各取各的：
      - **权限**（能用到哪些工具）→ 决定 `tools` 里有什么；
      - **模式**（要不要问）→ 通过 `toolContext.mode` 交给各工具自己判断。
    */
    const { aiPermission, aiAllowedTools, aiOutputLanguage, locale } =
      usePreferencesStore.getState()
    /*
      「跟随界面语言」在这里落地：设置是 `auto` 就用界面语言，否则用用户单独指定的那门，
      再翻成该语言的**自名**（「日本語」而不是「日语」）—— 服务端的提示词只认自名。
    */
    const outputLanguageName = resolveOutputLanguageName(
      aiOutputLanguage === 'auto' ? locale : aiOutputLanguage,
    )

    const pageSpec = resolveAiPageContext(getPageContext().routePath)
    const hasForms =
      hasPageFormCapability() ||
      Boolean(pageSpec?.forms && pageSpec.forms.length > 0)

    /*
      后端权限点 —— **在把工具交给模型之前先过滤一次**。
      失败会降级成空清单（AI 更保守），不阻断这条链路；真正的边界仍在
      「执行时用用户身份 + 后端校验」。
    */
    const { permissions } = await ensureUserPermissions(getQueryClient())

    const stream = streamAssistantTurn({
      messages,
      /*
        事实快照由前端采集、随请求上报（页面描述 / 字段名 / 接口描述 / 导航 / 表单 / 任务）。
        规则（身份 / 范围闸 / 能力 / 工作方式 / 回答方式）在服务端 —— 见 `prompt-facts.ts` 的边界表。
      */
      promptFacts: collectPromptFacts({ mode, surface, outputLanguageName }),
      // 页面具备表单能力或已挂载表单时，保留表单工具
      tools: getAllowedTools(aiPermission, aiAllowedTools, {
        hasForms,
        surface,
        // 后端权限（上限）∩ 用户偏好（在权限内收紧）
        permissions,
      }),
      toolContext: buildToolContext(mode, surface, trimmed),
      supportsTools: capabilities?.supportsTools ?? true,
      abortSignal: controller.signal,
    })

    batcher = new StreamEventBatcher(assistantId)

    for await (const event of stream) {
      batcher.push(event)
    }

    batcher.flush()
    useAiSessionStore.getState().endTurn()
  } catch (error) {
    batcher?.flush()
    // 用户主动停止会走到这里（AbortError），不该报成错误
    if (controller.signal.aborted) {
      useAiSessionStore.getState().endTurn()
    } else {
      useAiSessionStore.getState().failTurn(describeError(error))
    }
  } finally {
    batcher?.flush()
    // 无论是正常结束、用户停止还是报错：挂起的审批都要了结，否则工具会一直等着
    rejectPendingApprovals()
    /*
      一轮结束（含失败与中止）统一落盘一次。
      流式期间**不写**：IDB 虽然异步，但为一轮回复开几十上百次事务没有意义，
      刷新丢的也只是半句话。
    */
    void useAiSessionStore.getState().persist()
    if (activeController === controller) activeController = null
  }
}

/** 中止当前这一轮（用户点停止）。 */
export function stopAiMessage(): void {
  // 先拒绝挂起的审批，再 abort：让工具带着「用户不同意」的结论退出，而不是抛 AbortError
  rejectPendingApprovals()
  activeController?.abort()
  activeController = null
  useAiSessionStore.getState().endTurn()
}
