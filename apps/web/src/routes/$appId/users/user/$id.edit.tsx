import { Button } from '@cloudflare/kumo'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { definePageCapabilities, usePageCapabilities } from '#/lib/ai'
import { getUserFormMetadata, UserFormView } from './-components/user-form-view'

/**
 * 用户运营 / 用户列表 / 编辑用户（/$appId/users/user/$id/edit）
 *
 * 极薄独立路由：负责 PageHeader 布局、取参和导航，业务表单由 UserFormView 承载。
 */
export const Route = createFileRoute('/$appId/users/user/$id/edit')({
  component: EditUserPage,
})

const EDIT_USER_CAPABILITIES = definePageCapabilities({
  routeId: Route.id,
  title: '编辑用户',
  description: '修改指定用户的基础资料档案信息（昵称、邮箱与头像）。',
  entities: ['用户', '昵称', '邮箱'],
  forms: [
    {
      id: 'user-form-edit',
      title: '编辑用户',
      action: 'edit',
      permission: 'user:edit',
      description: '修改指定用户的资料信息',
      fields: [
        {
          name: 'nickname',
          label: '用户昵称',
          type: 'text',
          required: true,
          description: '必填，用户昵称',
        },
        {
          name: 'email',
          label: '邮箱地址',
          type: 'text',
          description: '选填，邮箱地址',
        },
        {
          name: 'avatar_url',
          label: '头像 URL',
          type: 'text',
          description: '选填，头像图片链接',
        },
      ],
    },
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/user/{id}',
      purpose: '获取用户详情回显',
    },
    {
      method: 'PUT',
      path: '/user',
      permission: 'user:edit',
      purpose: '提交更新用户信息',
    },
  ],
})

function EditUserPage() {
  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const { appId, id } = Route.useParams()
  const meta = getUserFormMetadata('edit', t)

  usePageCapabilities(EDIT_USER_CAPABILITIES)

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
