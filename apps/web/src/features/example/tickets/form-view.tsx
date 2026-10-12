import { Button, Input, Loader, Select, Textarea } from '@cloudflare/kumo'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  getExampleTicketsById,
  postExampleTickets,
  putExampleTickets,
  type TicketItem,
} from '#/api'
import { useAiFormFields, useAiFormSubmit, type AiFormField } from '#/features/ai/core'
import { appToastManager } from '#/lib/toast'
import { toDisplayText } from '#/lib/to-text'

export interface TicketFormMetadata {
  title: string
  description: string
}

export function getTicketFormMetadata(mode: 'create' | 'edit', t: TFunction): TicketFormMetadata {
  return {
    title: mode === 'edit' ? t('form.editTitle', '编辑工单') : t('form.createTitle', '新建工单'),
    description:
      mode === 'edit'
        ? t('form.editDesc', '修改指定工单的信息')
        : t('form.createDesc', '录入一条新的工单'),
  }
}

export interface TicketFormViewProps {
  formId?: string
  mode?: 'create' | 'edit'
  ticketId?: number | string | null
  initialData?: TicketItem | null
  hideActions?: boolean
  onSuccess?: () => void
  onClose?: () => void
}

const PRIORITY_OPTIONS = [
  { value: '1', label: '低' },
  { value: '2', label: '中' },
  { value: '3', label: '高' },
  { value: '4', label: '紧急' },
]

export function TicketFormView({
  formId: formIdProp,
  mode = 'create',
  ticketId,
  initialData,
  hideActions = false,
  onSuccess,
  onClose,
}: TicketFormViewProps) {
  const { t } = useTranslation('example', { keyPrefix: 'tickets' })
  const isEdit = mode === 'edit' || !!ticketId
  const meta = getTicketFormMetadata(isEdit ? 'edit' : 'create', t)

  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [priority, setPriority] = useState(String(initialData?.priority ?? 2))
  const [assignee, setAssignee] = useState(initialData?.assignee ?? '')
  const [category, setCategory] = useState(initialData?.category ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title ?? '')
      setDescription(initialData.description ?? '')
      setPriority(String(initialData.priority ?? 2))
      setAssignee(initialData.assignee ?? '')
      setCategory(initialData.category ?? '')
      return
    }

    if (isEdit && ticketId) {
      const fetchDetail = async () => {
        setLoadingDetail(true)
        try {
          const res = await getExampleTicketsById({ path: { id: Number(ticketId) } })
          const item = res.data?.result
          if (item) {
            setTitle(item.title ?? '')
            setDescription(item.description ?? '')
            setPriority(String(item.priority ?? 2))
            setAssignee(item.assignee ?? '')
            setCategory(item.category ?? '')
          }
        } catch {
          // 由 API 层拦截器统一提示
        } finally {
          setLoadingDetail(false)
        }
      }
      void fetchDetail()
    }
  }, [ticketId, initialData, isEdit])

  const formBridgeId = isEdit
    ? `ticket-form-edit-${ticketId || initialData?.id || 'target'}`
    : 'ticket-form-create'

  const aiFields: AiFormField[] = [
    {
      name: 'title',
      label: t('form.title', '标题'),
      type: 'text',
      description: t('form.titlePlaceholder', '一句话描述问题'),
    },
    {
      name: 'priority',
      label: t('form.priority', '优先级'),
      type: 'select',
      description: '1=低, 2=中, 3=高, 4=紧急',
      options: PRIORITY_OPTIONS,
    },
    {
      name: 'assignee',
      label: t('form.assignee', '负责人'),
      type: 'text',
      description: t('form.assigneePlaceholder', '留空则为「未分配」'),
    },
    {
      name: 'category',
      label: t('form.category', '分类'),
      type: 'text',
      description: t('form.categoryPlaceholder', '如「缺陷」「需求」'),
    },
    {
      name: 'description',
      label: t('form.description', '描述'),
      type: 'text',
      description: t('form.descriptionPlaceholder', '补充复现步骤、期望结果等'),
    },
  ]

  useAiFormFields({
    id: formBridgeId,
    title: meta.title,
    fields: aiFields,
    getValues: () => ({
      title,
      description,
      priority: Number(priority) || 2,
      assignee,
      category,
    }),
    setValues: (patch) => {
      if (typeof patch.title === 'string') {
        setTitle(patch.title)
        if (titleError) setTitleError(null)
      }
      if (typeof patch.description === 'string') setDescription(patch.description)
      if (typeof patch.priority === 'number' || typeof patch.priority === 'string') {
        setPriority(String(patch.priority))
      }
      if (typeof patch.assignee === 'string') setAssignee(patch.assignee)
      if (typeof patch.category === 'string') setCategory(patch.category)
    },
  })

  const submitAction = useCallback(async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError(t('form.titleRequired', '请输入工单标题'))
      return
    }

    setSubmitting(true)
    try {
      const priorityNum = Number(priority) || 2
      if (!isEdit) {
        const res = await postExampleTickets({
          body: {
            title: trimmedTitle,
            description: description.trim(),
            priority: priorityNum,
            assignee: assignee.trim(),
            category: category.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.createSuccess', '创建工单成功'),
            variant: 'success',
          })
          onSuccess?.()
        }
      } else {
        const targetId = Number(ticketId || initialData?.id)
        const res = await putExampleTickets({
          body: {
            id: targetId,
            title: trimmedTitle,
            description: description.trim(),
            priority: priorityNum,
            assignee: assignee.trim(),
            category: category.trim(),
          },
        })
        if (res.data?.code === 0) {
          appToastManager.add({
            title: t('form.updateSuccess', '更新工单成功'),
            variant: 'success',
          })
          onSuccess?.()
        }
      }
    } catch (err) {
      appToastManager.add({
        title: isEdit ? t('form.updateFailed', '更新工单失败') : t('form.createFailed', '创建工单失败'),
        description: toDisplayText(err),
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    title,
    description,
    priority,
    assignee,
    category,
    isEdit,
    ticketId,
    initialData,
    onSuccess,
    t,
  ])

  useAiFormSubmit({
    id: formBridgeId,
    submit: submitAction,
    canSubmit: () => !submitting && !!title.trim(),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitAction()
  }

  const activeFormId = formIdProp || `form-${formBridgeId}`

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
        label={t('form.title', '标题')}
        error={titleError ? { message: titleError, match: 'customError' } : undefined}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          if (titleError) setTitleError(null)
        }}
        placeholder={t('form.titlePlaceholder', '一句话描述问题')}
        autoFocus
      />

      <Input
        label={t('form.assignee', '负责人')}
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        placeholder={t('form.assigneePlaceholder', '留空则为「未分配」')}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t('form.priority', '优先级')}
          value={priority}
          onValueChange={(value) => setPriority(String(value))}
          items={PRIORITY_OPTIONS}
        />
        <Input
          label={t('form.category', '分类')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t('form.categoryPlaceholder', '如「缺陷」「需求」')}
        />
      </div>

      <Textarea
        label={t('form.description', '描述')}
        value={description}
        onValueChange={(value) => setDescription(value)}
        placeholder={t('form.descriptionPlaceholder', '补充复现步骤、期望结果等')}
        autoResize
        minRows={4}
        maxRows={8}
      />

      {!hideActions ? (
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-kumo-line pt-4">
          {onClose ? (
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t('form.cancel', '取消')}
            </Button>
          ) : null}
          <Button variant="primary" form={activeFormId} type="submit" loading={submitting}>
            {t('form.save', '保存')}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
