import { WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'
import { isDocumentReload, useAiSessionStore } from '#/features/ai/core'
import { useAuthStore } from '#/lib/auth'
import { usePreferencesStore } from '#/lib/store'
import { useTimezone } from '#/lib/timezone'
import { ApprovalCard } from './approval-card'
import { GREETING_FALLBACK, greetingKeyOf } from './greeting'
import { AiMessageView } from './message-view'

export interface AiConversationProps {
  /**
   * 是否由本组件自己触发 `loadHistory`，默认 `true`（AI 面板）。
   *
   * 全屏对话页（`/$appId_.sphere`）传 `false`：那一页的**会话由路由决定**
   * （`sphere/` = 新会话、`sphere/chat/$chatId` = 指定会话），会话列表由布局统一加载。
   * 两边都调 `loadHistory` 的话，它的「恢复上次会话」会和路由的会话选择互相覆盖。
   */
  manageHistory?: boolean
}

/**
 * 会话区：把 store 里的消息渲染出来，并处理「还没内容」的状态。
 *
 * 两种空态依次是：
 * - **还没聊** → 一枚放大的头像 + 一句按时段变的问候；
 * - **正在跑** → 底部一行「正在思考…」，工具执行态则由消息里的工具卡片如实表达
 *   （见 `message-view.tsx`）。
 *
 * 早先还有第三种「还没配置模型服务」的空态（配一个「去设置」按钮）—— 走中间层后
 * **前端不再需要配置模型**（模型与凭证都在 `apps/ai`），它只会挡住本来能用的用户，已删除。
 *
 * 两种空态用的是**同一枚头像**（跟着同一个设置走），只有状态与尺寸不同 ——
 * 于是「刚打开」与「跑起来了」看到的是同一个角色，而不像两个不同的功能。
 *
 * 工具卡片的状态**来自真实事件**（`tool-call` / `tool-result` / `tool-error`），
 * 不是计时器演的动画 —— 这样「卡在某个工具上」一眼就能看出来。
 *
 * 单条消息的渲染规则在 `message-view.tsx`，可读性 / 可见性的判定（纯函数）在
 * `message-parts.ts`；这里只管「列表 + 空态 + 审批卡 + 错误条」。
 */
export function AiConversation({ manageHistory = true }: AiConversationProps) {
  const { t } = useTranslation('ai')
  const messages = useAiSessionStore((state) => state.messages)
  const status = useAiSessionStore((state) => state.status)
  const error = useAiSessionStore((state) => state.error)
  const pendingApproval = useAiSessionStore((state) => state.pendingApproval)
  const loadHistory = useAiSessionStore((state) => state.loadHistory)
  /*
    这里原有一个「还没配置模型服务」的空态（配一个「去设置」按钮）—— 走中间层后
    **前端不再需要配置模型**（模型与凭证都在服务端），它只会挡住本来能用的用户，已删除。
    服务端不可用的情况由发送失败后的 `status === 'error'` 展示承担。
  */
  // 会话按 app 分区存 IDB，所以切换应用要换一批历史
  const appId = useAuthStore((state) => state.currentApp?.id ?? null)
  // 空态问候语按用户设置的时区判断时段（不是本机时区）
  const { timezoneMeta } = useTimezone()
  // 「新会话时机」（见下面的 loadHistory）
  const sessionMode = usePreferencesStore((state) => state.aiSessionMode)

  /*
    进入面板（以及切换应用）时加载该 app 的会话历史。
    `loadHistory` 内部对「同一个 app 已经加载过」会早退 —— 面板关掉再打开是一次重挂载，
    没有那道判断就会用 IDB 里的旧版本覆盖掉流式回复已经吐出来的增量。

    `fresh` 只在**本次页面载入是重新载入**（刷新页面 / 新标签页，见 `isDocumentReload`）
    并且设置里选了「刷新后新会话」时成立：列表照常加载、但不恢复上次那段，直接落在空的
    新会话上。同一份文档里关掉面板再打开不算重新载入，当前会话原样留着 —— **不必**在
    面板打开的那一刻清内存（旧实现在打开上升沿调 `startNewSession()`，那与「同一页面内
    接着上一段说」是矛盾的）。
  */
  useEffect(() => {
    if (!manageHistory) return
    void loadHistory({ fresh: sessionMode === 'new' && isDocumentReload() })
  }, [appId, loadHistory, sessionMode, manageHistory])

  // 时段问候只用在空态，但放在这里算也行（一次 Intl 调用，可忽略）
  const greetingKey = greetingKeyOf(timezoneMeta.iana)

  if (messages.length === 0) {
    /*
      新对话的空态：一枚**放大的 AI 形象** + 一句按时段变的问候。
      头像就是会话里那个（同一个设置、同一个形状），只是大一号 —— 于是
      「刚打开」和「正在聊」看到的是同一个角色，而不是两个不同的图标。

      问候语强调用 `font-semibold`（禁用粗体类，见 AGENTS.md 铁律 2），字号 16px（`text-base`）
      按 Kumo 规范属于标题档。
    */
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <AiBotAvatar size={96} />

        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-kumo-default">
            {t(`greetings.${greetingKey}`, GREETING_FALLBACK[greetingKey])}
          </p>
          <p className="max-w-64 text-sm text-kumo-subtle">
            {t('greetingPrompt', '今天想做点什么？')}
          </p>
        </div>

        {error ? (
          <div className="flex max-w-sm items-center gap-2 rounded-xl border border-kumo-danger/20 bg-kumo-danger-tint px-3.5 py-2 text-xs text-kumo-danger shadow-xs">
            <WarningCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <AiMessageView
          key={message.id}
          message={message}
          /*
            只有**最后一条**消息在流式中（`status === 'streaming'`）时才走纯文本降级；
            之前那些消息都已经定稿，直接渲染 Markdown。
          */
          streaming={status === 'streaming' && message.id === messages[messages.length - 1]?.id}
          pendingApproval={pendingApproval !== null}
        />
      ))}

      {/*
        等待确认时展示审批卡；不再在下方冗余渲染带有 20px 小头像的「正在思考…」，
        思考状态已内聚到当前助手消息内部渲染，保持头像单一且连贯。
      */}
      {pendingApproval ? <ApprovalCard approval={pendingApproval} /> : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-kumo-danger/20 bg-kumo-danger-tint px-3 py-2 text-xs text-kumo-danger">
          <WarningCircleIcon size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}
