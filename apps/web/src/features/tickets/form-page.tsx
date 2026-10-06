import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { getTicketFormMetadata, TicketFormView } from './form-view'

/**
 * 新建 / 编辑工单的**独立页**形态（`/$appId/example/tickets/new` 与 `.../$id/edit`）。
 *
 * 表单打开方式是用户的偏好（弹窗 / 分屏 / 独立页，见 `formOpenMode`）：选「独立页」时
 * 走这里。新建与编辑共用同一份表单实现，差别只有 `mode` 与是否带 `ticketId`。
 */
export function TicketCreatePage({ appId }: { appId: string }) {
  const { t } = useTranslation('tickets')
  const navigate = useNavigate()
  const meta = getTicketFormMetadata('create', t)

  const back = () => navigate({ to: '/$appId/example/tickets', params: { appId } })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button variant="secondary" icon={<ArrowLeftIcon size={16} />} onClick={back}>
            {t('detail.back', '返回列表')}
          </Button>
        }
      />
      <TicketFormView variant="page" mode="create" onClose={back} onSuccess={back} />
    </div>
  )
}

export function TicketEditPage({ appId, id }: { appId: string; id: string }) {
  const { t } = useTranslation('tickets')
  const navigate = useNavigate()
  const meta = getTicketFormMetadata('edit', t)

  const back = () => navigate({ to: '/$appId/example/tickets', params: { appId } })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={`${meta.description} (ID ${id})`}
        actions={
          <Button variant="secondary" icon={<ArrowLeftIcon size={16} />} onClick={back}>
            {t('detail.back', '返回列表')}
          </Button>
        }
      />
      <TicketFormView variant="page" mode="edit" ticketId={id} onClose={back} onSuccess={back} />
    </div>
  )
}
