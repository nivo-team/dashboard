import { LayerCard } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { CopyableValue } from '#/components/copyable-value'
import { displayDictCode } from '#/lib/dict-key'
import { useTimezone } from '#/lib/timezone'
import { dictStatusBadge, dictValueTypeBadge } from './data-dict-columns'
import { toEpochMs } from './data-dict-options'
import type { DictType } from './data-dict-types'

/**
 * 分类的只读信息卡片（详情页侧栏）。
 *
 * 只呈现分类自身的元信息；编辑走页头的「编辑分类」弹窗 —— 与 features 详情页把表单常驻在
 * 左列不同，数据字典的分类只有几个字段，常驻表单反而比弹窗更重。
 *
 * 「完整编码」用 `CopyableValue`：业务侧真正要复制的通常是 `p_code`（如 `common.channel`），
 * 它是从根到自身的完整 code 链，比局部 code 更有用。
 */

interface DictTypeInfoCardProps {
  node: DictType
  /** 上级分类名称（顶级时传 undefined，展示「根层级」）。 */
  parentName?: string
}

export function DictTypeInfoCard({ node, parentName }: DictTypeInfoCardProps) {
  const { t } = useTranslation('dataDict')
  const { formatDateTime } = useTimezone()

  const createdAt = toEpochMs(node.created_at)

  return (
    <LayerCard className="p-0">
      <LayerCard.Secondary>{t('sections.details', '详细信息')}</LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-3 p-4">
        <InfoRow label={t('detail.parentType', '上级分类')}>
          <span className="text-sm text-kumo-default">
            {parentName ?? t('detail.rootType', '根层级')}
          </span>
        </InfoRow>

        <InfoRow label={t('detail.fullCode', '完整编码')}>
          {node.p_code ? (
            // 展示统一用逻辑 code：剥掉临时的 `new.` 命名空间（见 #/lib/dict-key）
            <CopyableValue text={displayDictCode(node.p_code)} />
          ) : (
            <span className="text-sm text-kumo-subtle">{node.code ?? '-'}</span>
          )}
        </InfoRow>

        <InfoRow label={t('detail.valueType', '键值类型')}>
          {dictValueTypeBadge(node.type, t)}
        </InfoRow>

        <InfoRow label={t('detail.status', '状态')}>{dictStatusBadge(node.status, t)}</InfoRow>

        <InfoRow label={t('detail.sort', '排序')}>
          <span className="font-mono text-sm text-kumo-default tabular-nums">
            {node.sort ?? 0}
          </span>
        </InfoRow>

        <InfoRow label={t('detail.id', '分类 ID')}>
          <CopyableValue text={String(node.id)} />
        </InfoRow>

        {node.created_at !== undefined && node.created_at !== null ? (
          <InfoRow label={t('detail.createdAt', '创建时间')}>
            <span className="text-sm text-kumo-subtle">
              {createdAt === null ? String(node.created_at) : formatDateTime(createdAt)}
            </span>
          </InfoRow>
        ) : null}

        {node.remark ? (
          <InfoRow label={t('detail.remark', '备注')}>
            <span className="text-sm text-kumo-default break-words">{node.remark}</span>
          </InfoRow>
        ) : null}
      </LayerCard.Primary>
    </LayerCard>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-kumo-subtle">{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  )
}
