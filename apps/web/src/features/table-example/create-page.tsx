import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { useFeature } from '#/features/ai/page'
import { getTableExampleFormMetadata, TableExampleFormView } from './form-view'
import { tableExampleCreateFeature } from './create-feature'

/**
 * 新建记录页（`/$appId/example/table/new`）。
 *
 * 页面只负责「外框 + 导航」，表单本体与 AI 表单桥都在 `TableExampleFormView` 里 ——
 * 新建与编辑共用同一份表单实现，两页的差别只有 `mode`。
 */
export function TableExampleCreatePage({ appId }: { appId: string }) {
  const { t } = useTranslation('table-example')
  const navigate = useNavigate()
  const meta = getTableExampleFormMetadata('create', t)

  useFeature(tableExampleCreateFeature)

  const handleBack = () => {
    navigate({ to: '/$appId/example/table', params: { appId } })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button
            variant="secondary"
            icon={<ArrowLeftIcon size={16} />}
            onClick={handleBack}
          >
            {t('detail.back', '返回列表')}
          </Button>
        }
      />
      <TableExampleFormView
        variant="page"
        mode="create"
        onClose={handleBack}
        onSuccess={handleBack}
      />
    </div>
  )
}
