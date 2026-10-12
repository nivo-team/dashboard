import { Button, LayerCard } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import type { CrudController } from './types'

export interface CrudViewContainerProps {
  crud: CrudController<any>
  children: ReactNode
  cardClassName?: string
}

export function CrudViewContainer({ crud, children, cardClassName }: CrudViewContainerProps) {
  const { t } = useTranslation('common')
  const { activeView } = crud

  if (!crud.isPageMode) return null

  const isForm = activeView.type === 'page-form'
  const title = 'title' in activeView ? activeView.title : ''
  const description = 'description' in activeView ? activeView.description : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeftIcon size={16} className="rtl-flip" />}
            onClick={crud.close}
          >
            {t('back', { defaultValue: '返回列表' })}
          </Button>
        }
      />
      {isForm ? (
        <LayerCard.Primary className={cardClassName ?? 'max-w-2xl p-6'}>
          {children}
        </LayerCard.Primary>
      ) : (
        <div className="flex flex-col gap-4">{children}</div>
      )}
    </div>
  )
}
