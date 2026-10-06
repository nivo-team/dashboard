import { LayerDialog } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { useAiSessionStore } from '#/features/ai/core'
import type { AiSessionSummary } from '#/features/ai/core'

/**
 * 删除会话的确认弹窗（`LayerDialog.Alert`）。
 *
 * 两个入口共用：AI 面板头行浮层选择器里的删除按钮，以及全屏对话页会话侧边栏里的删除按钮。
 * 会话记录是纯本地数据，但误删会丢掉整段对话，所以必须问一句（与仓库其它删除操作一致）。
 *
 * `session` 为 `null` 表示关闭：调用方只持有「待删的是哪一条」这一个状态，
 * 不需要再额外维护一个 open 布尔值。
 *
 * 文案取 **common 命名空间**（`actions.cancel` / `actions.delete`）：
 * `ai` 命名空间里没有这两个键，直接在 `ai` 下 `t('actions.cancel', '取消')` 会让所有语言
 * 都落回中文兜底 —— 这正是这个组件从 `AiSessionPicker` 拆出来时顺手修掉的旧问题。
 */
export function AiSessionDeleteDialog({
  session,
  onOpenChange,
}: {
  /** 待删除的会话；`null` = 关闭 */
  session: AiSessionSummary | null
  /** 关闭 / 取消时的回调（确认删除后也会调用一次，用来收起弹窗） */
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('ai')
  const { t: tc } = useTranslation()
  const removeSession = useAiSessionStore((state) => state.removeSession)

  return (
    <LayerDialog.Alert open={session !== null} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('sessionDelete', '删除对话')}</LayerDialog.Title>
        {/* Body 是必须的（Kumo 断言 Title / Body / Actions 各一个），说明放这里 */}
        <LayerDialog.Body>
          <p className="text-sm text-kumo-subtle">
            {t('sessionDeleteDesc', '删除后这段对话无法恢复。')}
          </p>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={tc('actions.cancel', '取消')}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            onClick={() => {
              if (session) void removeSession(session.id)
              onOpenChange(false)
            }}
          >
            {tc('actions.delete', '删除')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  )
}
