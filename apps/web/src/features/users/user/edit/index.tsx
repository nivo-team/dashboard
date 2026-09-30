import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { useFeature } from '#/lib/features'
import { getUserFormMetadata, UserFormView } from '../form/user-form-view'
import { userEditFeature } from './feature'

/**
 * 编辑用户页（`/$appId/users/user/$id/edit`）。
 *
 * 与新建页同构：外框 + 导航在这里，表单本体与 AI 表单桥在 `UserFormView`。
 * 路由参数由薄路由文件传入，页面里没有路由字面量。
 */
export function UserEditPage({ appId, id }: { appId: string; id: string }) {
  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const meta = getUserFormMetadata('edit', t)

  useFeature(userEditFeature)

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
        mode="edit"
        userId={id}
        onClose={handleBack}
        onSuccess={handleBack}
      />
    </div>
  )
}
