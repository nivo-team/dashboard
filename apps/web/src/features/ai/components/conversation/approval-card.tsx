import { Button } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { getAiShellBridge, resolveAiApproval, useAiSessionStore } from '#/features/ai/core'
import type { AiMessagePart, PendingApproval } from '#/features/ai/core'
import { formatToolValue } from './format'

/**
 * 写操作 / 跳转的审批卡 —— 整个「人工审批」规则的**用户侧落点**。
 *
 * 工具的执行挂在 `chat.ts` 的 Promise 上：这里点了按钮，那边才继续（或不继续）。
 * 因此三件事必须同时成立：
 * - **参数原样展示**：用户要能看清到底要发什么（method / path / body 一个都不能藏）；
 * - **默认不放行**：没有点「允许」就永远停在 `await`，不存在超时自动执行；
 * - **三态可选**：`once`（只这一次）/ `session`（本会话不再询问，写会话级授权，
 *   刷新失效）/ `deny`（拒绝）。调研参考了 fx.sh 的会话级 grant ——
 *   写操作的免确认不该跨会话保留。
 *   ⚠️ 「允许一次」**真的只放行一次**：`once` 不写任何授权（早期实现顺手写进了内存授权表，
 *   于是标签写"一次"、行为是"本会话"，被这个三态修掉了）。
 *
 * ## 跳转形态（`kind === 'navigate'`）
 *
 * 跳转也走这条通道，但**卡片形状与语义不同**：给用户看的不是 `{path}` 这种原始 JSON，
 * 而是「页面名 + 路径 + 理由」；按钮是**三选一**：
 * - **带我去** = 只放行这一次（`once`，不写授权）→ 立即跳，下次还问；
 * - **本会话自动跳转** = 放行 + 记住（`session`）→ 写 `NAVIGATION_GRANT`，本会话内不再问；
 * - **先不跳** = 拒绝（工具会抛错，模型据此改用就地渲染 / 换个目标 / 反问）。
 *
 * 询问模式下才有这张卡：**自动模式 = 始终允许**，`navigate_to` 直接跳、根本不发请求。
 */
export function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const { t } = useTranslation('ai')

  if (approval.kind === 'navigate') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
        <p className="text-sm font-medium text-kumo-default">
          {t('navConfirmTitle', '要带你去这个页面吗？')}
        </p>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-kumo-default">{approval.label}</span>
          <span className="font-mono text-xs text-kumo-subtle">
            {approval.path}
            {approval.reason ? ` · ${approval.reason}` : ''}
          </span>
        </div>
        <p className="text-xs text-kumo-subtle">
          {t('navConfirmHint', '选「本会话自动跳转」后，本次对话里不再询问。')}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => resolveAiApproval(approval.id, 'once')}
          >
            {t('navConfirmGo', '带我去')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resolveAiApproval(approval.id, 'session')}
          >
            {t('navConfirmSession', '本会话自动跳转')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => resolveAiApproval(approval.id, 'deny')}>
            {t('navConfirmSkip', '先不跳')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
      <p className="text-sm font-medium text-kumo-default">
        {t('approvalTitle', '这个操作需要你确认')}
      </p>
      <p className="text-xs text-kumo-subtle">
        {t(`tools.${approval.toolName}`, approval.toolName)}
        {approval.reason ? ` · ${approval.reason}` : ''}
      </p>

      <pre className="max-h-40 overflow-auto rounded-lg bg-kumo-base p-2 font-mono text-xs text-kumo-default">
        {formatToolValue(approval.input)}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => resolveAiApproval(approval.id, 'once')}>
          {t('approve', '允许一次')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => resolveAiApproval(approval.id, 'session')}
        >
          {t('approveAlways', '本会话不再询问')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => resolveAiApproval(approval.id, 'deny')}>
          {t('deny', '拒绝')}
        </Button>
      </div>
    </div>
  )
}

/**
 * **全屏的跳转建议卡**（`nav-proposal` part）。
 *
 * 与面板的确认卡最根本的差别是**不阻塞**：工具早就返回了（AI 这一轮已经跑完，
 * 数据也渲染在下面），所以这张卡只是"要不要去真正的页面看"的入口，随时可点、也可不点。
 * 因此它是消息的一部分（落盘、刷新后还在），而不是一个挂起的 Promise。
 *
 * 跳转走外壳桥（与工具层同一条路）：两个容器都注册了桥，所以这里不需要 router 依赖。
 */
export function NavProposalCard({ part }: { part: Extract<AiMessagePart, { type: 'nav-proposal' }> }) {
  const { t } = useTranslation('ai')
  const resolveNavProposal = useAiSessionStore((state) => state.resolveNavProposal)

  const go = () => {
    resolveNavProposal(part.id, 'accepted')
    getAiShellBridge()?.navigate(part.path)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-control p-3">
      <p className="text-sm font-medium text-kumo-default">
        {t('navProposalTitle', '需要去页面查看吗？')}
      </p>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-kumo-default">{part.label}</span>
        <span className="font-mono text-xs text-kumo-subtle">
          {part.path}
          {part.reason ? ` · ${part.reason}` : ''}
        </span>
      </div>

      {part.state === 'accepted' ? (
        <p className="text-xs text-kumo-subtle">{t('navProposalAccepted', '已打开该页面。')}</p>
      ) : part.state === 'dismissed' ? (
        <p className="text-xs text-kumo-subtle">{t('navProposalDismissed', '已留在对话里。')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={go}>
            {t('navProposalGo', '带我去')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolveNavProposal(part.id, 'dismissed')}
          >
            {t('navProposalDismiss', '不用了')}
          </Button>
        </div>
      )}
    </div>
  )
}
