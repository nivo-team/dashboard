import { Button, Input, Loader, Select, Textarea } from '@cloudflare/kumo'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { getTicketById, postTicket, putTicket, type TicketItem } from '#/api'
import { useAiFormFields, useAiFormSubmit, type AiFormField } from '#/lib/ai'
import { appToastManager } from '#/lib/toast'

/**
 * 工单表单（新建 / 编辑）—— 与 `table-example/form-view` 同一套结构：
 * 一个组件承担 page / split / dialog 三种形态，AI 表单桥两半（字段 + 提交）由它注册。
 *
 * `priority` 在表单里是**字符串**（`Select` 的值），提交时转成数字 —— 与接口契约对齐。
 */

export interface TicketFormMetadata {
  title: string
  description: string
}

export function getTicketFormMetadata(
  mode: 'create' | 'edit',
  t: TFunction,
): TicketFormMetadata {
  return {
    title: mode === 'edit' ? t('form.editTitle', '编辑工单') : t('form.createTitle', '新建工单'),
    description:
      mode === 'edit'
        ? t('form.editDesc', '修改指定工单的信息')
        : t('form.createDesc', '录入一条新的工单'),
  }
}

export interface TicketFormViewProps {
  variant?: 'page' | 'split' | 'dialog'
  formId?: string
  mode?: 'create' | 'edit'
  ticketId?: number | string | null
  initialData?: TicketItem | null
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
  variant = 'page',
  formId: formIdProp,
  mode = 'create',
  ticketId,
  initialData,
  onSuccess,
  onClose,
}: TicketFormViewProps) {
  const { t } = useTranslation('tickets')
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
          const res = await getTicketById({ path: { id: Number(ticketId) } })
          const item = res.data?.result
          if (item) {
            setTitle(item.title ?? '')
            setDescription(item.description ?? '')
            setPriority(String(item.priority ?? 2))
            setAssignee(item.assignee ?? '')
            setCategory(item.category ?? '')
          }
        } catch {
          // 接口异常由拦截器处理
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
    { name: 'title', label: t('form.title', '标题'), type: 'text', required: true },
    { name: 'description', label: t('form.description', '描述'), type: 'text' },
    {
      name: 'priority',
      label: t('form.priority', '优先级'),
      type: 'select',
      options: PRIORITY_OPTIONS,
    },
    { name: 'assignee', label: t('form.assignee', '负责人'), type: 'text' },
    { name: 'category', label: t('form.category', '分类'), type: 'text' },
  ]

  useAiFormFields({
    id: formBridgeId,
    title: meta.title,
    fields: aiFields,
    getValues: () => ({ title, description, priority, assignee, category }),
    setValues: (patch) => {
      if (typeof patch.title === 'string') {
        setTitle(patch.title)
        if (titleError) setTitleError(null)
      }
      if (typeof patch.description === 'string') setDescription(patch.description)
      // priority 可能是数字（模型给的）也可能是字符串（表单控件的值），统一成字符串
      if (patch.priority !== undefined) setPriority(String(patch.priority))
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
      const body = {
        title: trimmedTitle,
        description: description.trim(),
        priority: Number(priority) || 2,
        assignee: assignee.trim() || '未分配',
        category: category.trim() || '咨询',
      }

      if (!isEdit) {
        const res = await postTicket({ body })
        if (res.data?.code === 0) {
          appToastManager.add({ title: t('form.createSuccess', '创建工单成功'), variant: 'success' })
          onSuccess?.()
        }
      } else {
        const targetId = Number(ticketId || initialData?.id)
        const res = await putTicket({ body: { id: targetId, ...body } })
        if (res.data?.code === 0) {
          appToastManager.add({ title: t('form.updateSuccess', '更新工单成功'), variant: 'success' })
          onSuccess?.()
        }
      }
    } finally {
      setSubmitting(false)
    }
  }, [title, description, priority, assignee, category, isEdit, ticketId, initialData, onSuccess, t])

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
      </form>
    )
  }

  if (variant === 'dialog') return renderFormFields()

  if (variant === 'split') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto p-4">{renderFormFields()}</div>
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

  // page 形态：整页卡片
  return (
    <div className="flex flex-col gap-5">
      {renderFormFields()}
      <div className="flex items-center justify-end gap-3">
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
