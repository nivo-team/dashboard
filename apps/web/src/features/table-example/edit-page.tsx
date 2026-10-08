import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { useFeature } from '#/features/ai/page'
import { getTableExampleFormMetadata, TableExampleFormView } from './form-view'
import { tableExampleEditFeature } from './edit-feature'

/**
 * 编辑记录页（`/$appId/example/table/$id/edit`）。
 *
 * 与新建页同构：外框 + 导航在这里，表单本体与 AI 表单桥在 `TableExampleFormView`。
 * 路由参数由薄路由文件传入，页面里没有路由字面量。
 */
export function TableExampleEditPage({ appId, id }: { appId: string; id: string }) {
  const { t } = useTranslation('table-example')
  const navigate = useNavigate()
  const meta = getTableExampleFormMetadata('edit', t)

  useFeature(tableExampleEditFeature)

  const handleBack = () => {
    navigate({ to: '/$appId/example/table', params: { appId } })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button variant="secondary" icon={<ArrowLeftIcon size={16} />} onClick={handleBack}>
            {t('detail.back', '返回列表')}
          </Button>
        }
      />
      <TableExampleFormView
        variant="page"
        mode="edit"
        userId={id}
        onClose={handleBack}
        onSuccess={handleBack}
      />
    </div>
  )
}
