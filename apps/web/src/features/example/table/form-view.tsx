import { Button, Input, LayerCard, Loader } from '@cloudflare/kumo'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { getExampleTableById, postExampleTable, putExampleTable, type UserItem } from '#/api'
import { useAiFormFields, useAiFormSubmit, type AiFormField } from '#/features/ai/core'
import { appToastManager } from '#/lib/toast'

export interface TableExampleFormMetadata {
  title: string
  description: string
}

/**
 * 标准化获取记录表单的标题与描述文案。
 * 由承载该表单的具体布局（独立页面 PageHeader、分屏面板 Header、弹窗 LayerDialog.Title）统一调用，
 * 表单组件自身不内嵌任何多余的 Header。
 */
export function getTableExampleFormMetadata(
  mode: 'create' | 'edit',
  t: TFunction,
): TableExampleFormMetadata {
  return {
    title: mode === 'edit' ? t('form.editTitle', '编辑记录') : t('form.createTitle', '新建记录'),
    description:
      mode === 'edit'
        ? t('form.editDesc', '修改指定记录的资料信息')
        : t('form.createDesc', '添加平台新记录的基础档案信息'),
  }
}

export interface TableExampleFormViewProps {
  /** 渲染形态：page (独立整页卡片) | split (分屏内联) | dialog (弹窗内联) */
  variant?: 'page' | 'split' | 'dialog'
  /** 外部指定的表单 ID（用于与 Dialog Actions 关联提交） */
  formId?: string
  /** 模式：新建或编辑 */
  mode?: 'create' | 'edit'
  /** 目标记录 ID（编辑模式下可传 ID 自动加载数据） */
  userId?: number | string | null
  /** 初始数据（若已有则直接填充，无需重新 fetch） */
  initialData?: UserItem | null
  /** 提交成功回调 */
  onSuccess?: () => void
  /** 取消/返回/关闭回调 */
  onClose?: () => void
}

export function TableExampleFormView({
  variant = 'page',
  formId: formIdProp,
  mode = 'create',
  userId,
  initialData,
  onSuccess,
  onClose,
}: TableExampleFormViewProps) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })
  const isEdit = mode === 'edit' || !!userId
  const meta = getTableExampleFormMetadata(isEdit ? 'edit' : 'create', t)

  const [nickname, setNickname] = useState(initialData?.nickname ?? '')
  const [email, setEmail] = useState(initialData?.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialData?.avatar_url ?? '')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 1. 若为编辑态且未传入完整 initialData，自动按 ID 查询
  useEffect(() => {
    if (initialData) {
      setNickname(initialData.nickname || '')
      setEmail(initialData.email || '')
      setAvatarUrl(initialData.avatar_url || '')
      return
    }

    if (isEdit && userId) {
      const fetchDetail = async () => {
        setLoadingDetail(true)
        try {
          const res = await getExampleTableById({ path: { id: Number(userId) } })
          if (res.data?.result) {
            const u = res.data.result
            setNickname(u.nickname || '')
            setEmail(u.email || '')
            setAvatarUrl(u.avatar_url || '')
          }
        } catch {
          // 接口异常由拦截器处理
        } finally {
          setLoadingDetail(false)
        }
      }
      void fetchDetail()
    }
  }, [userId, initialData, isEdit])

  // 2. 原生接入 AI 表单桥（让 AI 能够感知、填充并提交此表单）
  const formBridgeId = isEdit
    ? `table-example-form-edit-${userId || initialData?.id || 'target'}`
    : 'table-example-form-create'

  const aiFields: AiFormField[] = [
    {
      name: 'nickname',
      label: t('form.nickname', '记录昵称'),
      type: 'text',
      description: t('form.nicknamePlaceholder', '请输入记录昵称'),
    },
    {
      name: 'email',
      label: t('form.email', '邮箱地址'),
      type: 'text',
      description: t('form.emailPlaceholder', '例如 user@example.com'),
    },
    {
      name: 'avatar_url',
      label: t('form.avatarUrl', '头像 URL'),
      type: 'text',
      description: t('form.avatarUrlPlaceholder', '可选，头像图片链接'),
    },
  ]

  useAiFormFields({
    id: formBridgeId,
    title: meta.title,
    fields: aiFields,
    getValues: () => ({
      nickname,
      email,
      avatar_url: avatarUrl,
    }),
    setValues: (patch) => {
      if (typeof patch.nickname === 'string') {
        setNickname(patch.nickname)
        if (nicknameError) setNicknameError(null)
      }
      if (typeof patch.email === 'string') setEmail(patch.email)
      if (typeof patch.avatar_url === 'string') setAvatarUrl(patch.avatar_url)
    },
  })

  const submitAction = useCallback(async () => {
    const trimmedNick = nickname.trim()
    if (!trimmedNick) {
      setNicknameError(t('form.nicknameRequired', '请输入记录昵称'))
      return
    }

    setSubmitting(true)
    try {
      if (!isEdit) {
        const res = await postExampleTable({
          body: {
            nickname: trimmedNick,
            email: email.trim(),
            avatar_url: avatarUrl.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.createSuccess', '创建记录成功'),
            variant: 'success',
          })
          onSuccess?.()
        }
      } else {
        const targetId = Number(userId || initialData?.id)
        const res = await putExampleTable({
          body: {
            id: targetId,
            nickname: trimmedNick,
            email: email.trim(),
            avatar_url: avatarUrl.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.updateSuccess', '更新记录成功'),
            variant: 'success',
          })
          onSuccess?.()
        }
      }
    } finally {
      setSubmitting(false)
    }
  }, [nickname, email, avatarUrl, isEdit, userId, initialData, onSuccess, t])

  useAiFormSubmit({
    id: formBridgeId,
    submit: submitAction,
    canSubmit: () => !submitting && !!nickname.trim(),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitAction()
  }

  const activeFormId = formIdProp || `form-${formBridgeId}`

  // 表单输入控件主体（纯表单，无 Header）
  const renderFormFields = () => {
    if (loadingDetail) {
      return (
        <div className="flex h-40 items-center justify-center">
          <Loader size="lg" />
        </div>
      )
    }
    return (
      <form id={activeFormId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t('form.nickname', '记录昵称')}
          error={nicknameError ? { message: nicknameError, match: 'customError' } : undefined}
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
    )
  }

  // 形态 1：Dialog 弹窗内嵌（作为 LayerDialog.Body 的直接子级渲染）
  if (variant === 'dialog') {
    return renderFormFields()
  }

  // 形态 2：分屏并列内嵌（标题和关闭按钮已由分屏外壳渲染，此处不重复输出 Header）
  if (variant === 'split') {
    return (
      <div className="flex h-full flex-col">
        {/* 表单内容区 */}
        <div className="flex-1 overflow-y-auto p-4">{renderFormFields()}</div>

        {/* 底部固定操作条 */}
        <div className="flex items-center justify-end gap-3 border-t border-kumo-line bg-kumo-base px-4 py-3">
          {onClose ? (
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t('form.cancel', '取消')}
            </Button>
          ) : null}
          <Button variant="primary" form={activeFormId} type="submit" loading={submitting}>
            {t('form.save', '保存')}
          </Button>
        </div>
      </div>
    )
  }

  // 形态 3：独立完整页面（外层 PageHeader 由页面路由统一渲染，此处输出表单卡片）
  return (
    <LayerCard.Primary className="max-w-2xl p-6">
      {renderFormFields()}

      <div className="mt-8 flex items-center justify-end gap-3 border-t border-kumo-line pt-4">
        {onClose ? (
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('form.cancel', '取消')}
          </Button>
        ) : null}
        <Button variant="primary" form={activeFormId} type="submit" loading={submitting}>
          {t('form.save', '保存')}
        </Button>
      </div>
    </LayerCard.Primary>
  )
}
