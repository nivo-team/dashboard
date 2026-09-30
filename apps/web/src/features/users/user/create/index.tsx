import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { useFeature } from '#/lib/features'
import { getUserFormMetadata, UserFormView } from '../form/user-form-view'
import { userCreateFeature } from './feature'

/**
 * 新建用户页（`/$appId/users/user/new`）。
 *
 * 页面只负责「外框 + 导航」，表单本体与 AI 表单桥都在 `UserFormView` 里 ——
 * 新建与编辑共用同一份表单实现，两页的差别只有 `mode`。
 */
export function UserCreatePage({ appId }: { appId: string }) {
  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const meta = getUserFormMetadata('create', t)

  useFeature(userCreateFeature)

  const handleBack = () => {
    navigate({ to: '/$appId/users/user', params: { appId } })
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
      <UserFormView
        variant="page"
        mode="create"
        onClose={handleBack}
        onSuccess={handleBack}
      />
    </div>
  )
}
