import { Input, LayerDialog } from '@cloudflare/kumo'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postUser, putUser, type UserItem } from '#/api'
import { appToastManager } from '#/lib/toast'

export interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialData?: UserItem | null
  onSuccess: () => void
}

export function UserFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSuccess,
}: UserFormDialogProps) {
  const { t } = useTranslation('users')
  const formId = `user-form-${mode}`

  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setNickname(initialData.nickname || '')
        setEmail(initialData.email || '')
        setAvatarUrl(initialData.avatar_url || '')
      } else {
        setNickname('')
        setEmail('')
        setAvatarUrl('')
      }
      setNicknameError(null)
    }
  }, [open, mode, initialData])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedNick = nickname.trim()
    if (!trimmedNick) {
      setNicknameError(t('form.nicknameRequired', '请输入用户昵称'))
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const res = await postUser({
          body: {
            nickname: trimmedNick,
            email: email.trim(),
            avatar_url: avatarUrl.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.createSuccess', '创建用户成功'),
            variant: 'success',
          })
          onOpenChange(false)
          onSuccess()
        }
      } else if (mode === 'edit' && initialData?.id) {
        const res = await putUser({
          body: {
            id: initialData.id,
            nickname: trimmedNick,
            email: email.trim(),
            avatar_url: avatarUrl.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.updateSuccess', '更新用户成功'),
            variant: 'success',
          })
          onOpenChange(false)
          onSuccess()
        }
      }
    } catch {
      // 错误由全局 API 拦截器提示 toast
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    mode === 'create'
      ? t('form.createTitle', '新建用户')
      : t('form.editTitle', '编辑用户')
  const description =
    mode === 'create'
      ? t('form.createDesc', '添加平台新用户的基础档案信息')
      : t('form.editDesc', '修改指定用户的资料信息')

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>

        <LayerDialog.Body>
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label={t('form.nickname', '用户昵称')}
              error={
                nicknameError
                  ? { message: nicknameError, match: 'customError' }
                  : undefined
              }
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                if (nicknameError) setNicknameError(null)
              }}
              placeholder={t('form.nicknamePlaceholder', '请输入昵称')}
              autoFocus
            />

            <Input
              label={t('form.email', '邮箱地址')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('form.emailPlaceholder', '例如 user@example.com')}
            />

            <Input
              label={t('form.avatarUrl', '头像 URL')}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder={t('form.avatarUrlPlaceholder', '可选，头像图片链接')}
            />
          </form>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={formId} type="submit" loading={submitting}>
            {t('form.save', '保存')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
